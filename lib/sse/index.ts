/**
 * Real-time events abstraction. The public signature (`subscribeToEvents`)
 * is STABLE: dashboard, agenda, conversations, and notifications consume it
 * the same way. In F4-C only the internal implementation changes to real SSE.
 *
 * Why `fetch` and not `EventSource`: the backend authenticates `/api/events/stream/`
 * via the `Authorization: Bearer` header and our access token lives ONLY in memory.
 * Native `EventSource` can't send headers (only cookies), and the refresh cookie
 * is scoped to `/api/auth/`. That's why the stream is read with `fetch` +
 * `ReadableStream`, with its own backoff reconnection and token refresh.
 *
 * Multiplexes: a single stream feeds all subscribers.
 */
import { API_BASE_URL, peekAccessToken, refreshAuthOnce } from "@/lib/api/client";
import type { SSEEvent, SSEEventType } from "@/lib/types";

export type SSEEventHandler = (event: SSEEvent) => void;

let seq = 0;
/** Unique event id (for client-side dedupe). */
export function nextEventId(): string {
  seq += 1;
  return `evt_${Date.now().toString(36)}_${seq}`;
}

// --- Real stream (fetch + SSE) ---------------------------------------------

const listeners = new Set<SSEEventHandler>();
let abort: AbortController | null = null;
let running = false;

const STREAM_URL = new URL("/api/events/stream/", API_BASE_URL).toString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Maps the backend envelope `{event, data, correlation_id}` to the frontend
 * `SSEEvent` `{id, type, emitted_at, data}`: renames `event`→`type`, synthesizes
 * `id`/`emitted_at` (the backend doesn't send them), coerces integer ids to string,
 * and normalizes `start_datetime`→`start` / `slot`→`new_start`.
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

/** Processes an SSE frame (separated by `\n\n`): takes the `data:` lines. */
function dispatchFrame(frame: string): void {
  const payload = frame
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("\n");
  if (!payload) return; // comment (`: connected` / `: keep-alive`) or empty
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
        // Token expired: refresh and retry. We don't log out from the
        // stream — session validity is governed by the API calls.
        const refreshed = await refreshAuthOnce();
        if (!refreshed) {
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 15_000);
        }
        continue;
      }
      if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

      backoff = 1000; // connection OK → reset backoff
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
      // network error or abort → backoff reconnection
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
 * Subscribes to the backend's real-time event stream. Returns a cleanup
 * function.
 */
export function subscribeToEvents(onEvent: SSEEventHandler): () => void {
  listeners.add(onEvent);
  if (!running) void runStream();
  return () => {
    listeners.delete(onEvent);
    if (listeners.size === 0) stopStream();
  };
}
