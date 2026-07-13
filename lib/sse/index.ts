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
function nextEventId(): string {
  seq += 1;
  return `evt_${Date.now().toString(36)}_${seq}`;
}

// --- Real stream (fetch + SSE) ---------------------------------------------

const listeners = new Set<SSEEventHandler>();
/**
 * Concurrency guard. Each runStream() instance captures `++generation` at
 * start; stopStream() bumps it too. After EVERY await the loop compares its
 * captured value against the module's and exits silently if stale — so an
 * unsubscribe-all → resubscribe in the same tick (StrictMode double-mount)
 * can never leave two live loops dispatching every frame twice.
 */
let generation = 0;
/** AbortController of the CURRENT loop only; doubles as the "loop is live" flag. */
let currentAbort: AbortController | null = null;

const STREAM_URL = new URL("/api/events/stream/", API_BASE_URL).toString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Maps the backend envelope `{event, data, correlation_id}` to the frontend
 * `SSEEvent` `{id, type, emitted_at, data}`: renames `event`→`type`, synthesizes
 * `id`/`emitted_at` (the backend doesn't send them), coerces integer ids to string,
 * and normalizes `start_datetime`→`start`.
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
  const myGen = ++generation;
  const abort = new AbortController();
  currentAbort = abort;
  let backoff = 1000;
  try {
    while (myGen === generation) {
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
        if (myGen !== generation) return;

        if (res.status === 401) {
          // Token expired: refresh and retry. We don't log out from the
          // stream — session validity is governed by the API calls.
          const refreshed = await refreshAuthOnce();
          if (myGen !== generation) return;
          if (!refreshed) {
            await sleep(backoff);
            if (myGen !== generation) return;
            backoff = Math.min(backoff * 2, 15_000);
          }
          continue;
        }
        if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

        backoff = 1000; // connection OK → reset backoff
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (myGen === generation) {
          const { value, done } = await reader.read();
          if (myGen !== generation) return;
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
      if (myGen !== generation) return;
      await sleep(backoff);
      if (myGen !== generation) return;
      backoff = Math.min(backoff * 2, 15_000);
    }
  } finally {
    abort.abort();
  }
}

function stopStream(): void {
  generation += 1; // every live loop goes stale at its next await checkpoint
  currentAbort?.abort(); // unblock its pending fetch/read immediately
  currentAbort = null;
}

/**
 * Subscribes to the backend's real-time event stream. Returns a cleanup
 * function.
 */
export function subscribeToEvents(onEvent: SSEEventHandler): () => void {
  listeners.add(onEvent);
  if (!currentAbort) void runStream();
  return () => {
    listeners.delete(onEvent);
    if (listeners.size === 0) stopStream();
  };
}
