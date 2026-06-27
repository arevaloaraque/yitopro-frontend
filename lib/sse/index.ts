/**
 * Abstracción de eventos en tiempo real. La firma pública (`subscribeToEvents`)
 * es ESTABLE: dashboard, agenda, conversaciones y notificaciones la consumen
 * igual. En F4-C cambia solo la implementación interna a SSE real.
 *
 * Por qué `fetch` y no `EventSource`: el backend autentica `/api/events/stream/`
 * por header `Authorization: Bearer` y nuestro access token vive SOLO en memoria.
 * `EventSource` nativo no puede enviar headers (solo cookies), y la cookie de
 * refresh está acotada a `/api/auth/`. Por eso el stream se lee con `fetch` +
 * `ReadableStream`, con reconexión con backoff y refresh de token propios.
 *
 * Multiplexa: un único stream alimenta a todos los suscriptores.
 */
import { API_BASE_URL, peekAccessToken, refreshAuthOnce } from "@/lib/api/client";
import type { SSEEvent, SSEEventType } from "@/lib/types";

export type SSEEventHandler = (event: SSEEvent) => void;

let seq = 0;
/** Id único de evento (para dedupe en el cliente). */
export function nextEventId(): string {
  seq += 1;
  return `evt_${Date.now().toString(36)}_${seq}`;
}

// --- Stream real (fetch + SSE) ---------------------------------------------

const listeners = new Set<SSEEventHandler>();
let abort: AbortController | null = null;
let running = false;

const STREAM_URL = new URL("/api/events/stream/", API_BASE_URL).toString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mapea el envelope del backend `{event, data, correlation_id}` al `SSEEvent`
 * del front `{id, type, emitted_at, data}`: renombra `event`→`type`, sintetiza
 * `id`/`emitted_at` (el backend no los manda), coacciona ids enteros a string y
 * normaliza `start_datetime`→`start` / `slot`→`new_start`.
 */
export function mapSseEnvelope(raw: unknown): SSEEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const env = raw as { event?: unknown; data?: unknown };
  if (typeof env.event !== "string") return null;
  const data: Record<string, unknown> = {
    ...((env.data as Record<string, unknown> | undefined) ?? {}),
  };
  for (const k of Object.keys(data)) {
    if (k.endsWith("_id") && typeof data[k] === "number") data[k] = String(data[k]);
  }
  if ("start_datetime" in data && !("start" in data)) data.start = data.start_datetime;
  if ("slot" in data && !("new_start" in data)) data.new_start = data.slot;
  return {
    id: nextEventId(),
    type: env.event as SSEEventType,
    emitted_at: new Date().toISOString(),
    data,
  } as SSEEvent;
}

/** Procesa un frame SSE (separado por `\n\n`): toma las líneas `data:`. */
function dispatchFrame(frame: string): void {
  const payload = frame
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("\n");
  if (!payload) return; // comentario (`: connected` / `: keep-alive`) o vacío
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return;
  }
  const event = mapSseEnvelope(parsed);
  if (!event) return;
  for (const listener of listeners) listener(event);
}

async function runStream(): Promise<void> {
  running = true;
  let backoff = 1000;
  while (running) {
    abort = new AbortController();
    try {
      const token = peekAccessToken();
      const res = await fetch(STREAM_URL, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: abort.signal,
      });

      if (res.status === 401) {
        // Token vencido: refresca y reintenta. No cerramos sesión desde el
        // stream — la validez de la sesión la gobiernan las llamadas API.
        const refreshed = await refreshAuthOnce();
        if (!refreshed) {
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 15_000);
        }
        continue;
      }
      if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

      backoff = 1000; // conexión OK → reinicia backoff
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (running) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          dispatchFrame(buffer.slice(0, sep));
          buffer = buffer.slice(sep + 2);
        }
      }
    } catch {
      // error de red o abort → reconexión con backoff
    }
    if (!running) break;
    await sleep(backoff);
    backoff = Math.min(backoff * 2, 15_000);
  }
}

function stopStream(): void {
  running = false;
  abort?.abort();
  abort = null;
}

/**
 * Se suscribe al stream de eventos en tiempo real. Devuelve una función de
 * limpieza. Firma estable entre la implementación mock anterior y la real.
 */
export function subscribeToEvents(onEvent: SSEEventHandler): () => void {
  listeners.add(onEvent);
  if (!running) void runStream();
  return () => {
    listeners.delete(onEvent);
    if (listeners.size === 0) stopStream();
  };
}
