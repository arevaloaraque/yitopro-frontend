/**
 * Abstracción de eventos en tiempo real. La firma pública
 * (`subscribeToEvents`) es ESTABLE: al conectar el backend real (F4-C) solo
 * cambia la implementación interna, no la interfaz.
 *
 * - Modo mock: NO abre `EventSource`. Emite eventos simulados periódicamente
 *   (cada ~15-20s) y de forma programática cuando una acción mock lo amerita
 *   (los handlers MSW llaman `emitMockEvent`).
 * - Modo real: abre un `EventSource` contra `/api/events`.
 *
 * La suscripción debe hacerse UNA sola vez, a nivel del layout autenticado.
 */
import { API_BASE_URL } from "@/lib/api/client";
import type { SSEEvent, SSEEventType } from "@/lib/types";

export type SSEEventHandler = (event: SSEEvent) => void;

/** Genera el próximo evento simulado, o `null` si no hay nada que emitir. */
type MockEventGenerator = () => SSEEvent | null;

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

const SSE_EVENT_TYPES: SSEEventType[] = [
  "nueva_cita",
  "cita_cancelada",
  "cita_reagendada",
  "mensaje_recibido",
  "conversacion_escalada",
  "pedido_creado",
  "error_operativo",
  "error_integracion",
];

// --- Estado del bus mock ---------------------------------------------------

const listeners = new Set<SSEEventHandler>();
let mockGenerator: MockEventGenerator | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

const MIN_DELAY_MS = 15_000;
const MAX_DELAY_MS = 20_000;

/** Id de evento único (suficiente para dedupe en el cliente). */
export function nextEventId(): string {
  seq += 1;
  return `evt_${Date.now().toString(36)}_${seq}`;
}

function dispatch(event: SSEEvent): void {
  for (const listener of listeners) listener(event);
}

/**
 * Empuja un evento al stream mock. Lo usan los handlers MSW para reflejar
 * acciones (p.ej. crear una cita => `nueva_cita`).
 */
export function emitMockEvent(event: SSEEvent): void {
  if (!MOCKING) return;
  dispatch(event);
}

/**
 * Registra el generador de eventos periódicos del mock (lo llama
 * `mocks/browser` al arrancar el worker). Mantiene `lib/sse` desacoplado de
 * los datos mock.
 */
export function setMockEventGenerator(generator: MockEventGenerator): void {
  mockGenerator = generator;
}

function fallbackEvent(): SSEEvent {
  return {
    id: nextEventId(),
    type: "mensaje_recibido",
    emitted_at: new Date().toISOString(),
    data: {
      conversation_id: "conv_demo",
      message_id: nextEventId(),
      customer_id: "cus_demo",
      preview: "Nuevo mensaje de un cliente",
    },
  };
}

function scheduleNext(): void {
  const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  timer = setTimeout(() => {
    const event = mockGenerator?.() ?? fallbackEvent();
    if (event) dispatch(event);
    scheduleNext();
  }, delay);
}

function subscribeMock(onEvent: SSEEventHandler): () => void {
  listeners.add(onEvent);
  if (timer === null) scheduleNext();
  return () => {
    listeners.delete(onEvent);
    if (listeners.size === 0 && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

// --- Estado del bus real ----------------------------------------------------

let realSource: EventSource | null = null;
const realListeners = new Set<SSEEventHandler>();

function ensureRealSource(): EventSource {
  if (realSource) return realSource;
  const url = new URL("/api/events", API_BASE_URL).toString();
  const source = new EventSource(url, { withCredentials: true });

  const handle = (event: MessageEvent) => {
    try {
      const parsed = JSON.parse(event.data) as SSEEvent;
      for (const listener of realListeners) listener(parsed);
    } catch {
      // Ignoramos payloads malformados.
    }
  };

  source.addEventListener("message", handle);
  for (const type of SSE_EVENT_TYPES) {
    source.addEventListener(type, handle);
  }

  source.onerror = () => {
    // EventSource reconecta solo; si el backend cierra por 401,
    // F4-C debe disparar refresh + recrear el socket aquí con backoff.
  };

  realSource = source;
  return source;
}

function subscribeReal(onEvent: SSEEventHandler): () => void {
  ensureRealSource();
  realListeners.add(onEvent);
  return () => {
    realListeners.delete(onEvent);
    if (realListeners.size === 0 && realSource) {
      realSource.close();
      realSource = null;
    }
  };
}

/**
 * Se suscribe al stream de eventos. Devuelve una función de limpieza.
 * Firma estable entre modo mock y modo real.
 */
export function subscribeToEvents(onEvent: SSEEventHandler): () => void {
  return MOCKING ? subscribeMock(onEvent) : subscribeReal(onEvent);
}
