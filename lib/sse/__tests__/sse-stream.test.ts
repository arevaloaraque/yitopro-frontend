/**
 * Regression tests for the SSE generation-token guard (Fix 1): an
 * unsubscribe-all → resubscribe in the same tick (StrictMode double-mount)
 * must leave exactly ONE live loop, never two racing loops each dispatching
 * every frame. `sse.test.ts` keeps covering `mapSseEnvelope`; this file only
 * exercises the `runStream`/`subscribeToEvents` state machine, so it stubs
 * `fetch` directly (bypassing MSW) and reimports the module fresh per test,
 * since its concurrency guard (`generation`/`currentAbort`) is module-level
 * state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PendingRead = {
  resolve: (result: { value?: Uint8Array; done: boolean }) => void;
  reject: (err: unknown) => void;
};

function abortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

/** SSE frame: a `data:` line terminated by the blank line `dispatchFrame` splits on. */
function frame(event: string, data: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ event, data })}\n\n`;
}

/**
 * Minimal controllable stand-in for `Response.body`: feeds frames on demand
 * via `push`, and rejects any pending/future `read()` the instant the
 * request's `AbortSignal` fires (mirrors real fetch + `ReadableStream` under
 * cancellation).
 */
function createControllableStream(signal: AbortSignal) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let pending: PendingRead | null = null;
  let aborted = false;

  signal.addEventListener("abort", () => {
    aborted = true;
    pending?.reject(abortError());
    pending = null;
  });

  return {
    push(text: string) {
      chunks.push(encoder.encode(text));
      if (pending) {
        const p = pending;
        pending = null;
        p.resolve({ value: chunks.shift(), done: false });
      }
    },
    getReader() {
      return {
        read(): Promise<{ value?: Uint8Array; done: boolean }> {
          if (aborted) return Promise.reject(abortError());
          if (chunks.length > 0)
            return Promise.resolve({ value: chunks.shift(), done: false });
          return new Promise((resolve, reject) => {
            pending = { resolve, reject };
          });
        },
      };
    },
  };
}

/**
 * Stubs `globalThis.fetch` (bypassing MSW) to hand out one controllable
 * stream per call — rejecting immediately, like real fetch, if the request's
 * signal is already (or becomes) aborted before the connection "opens".
 */
function stubFetch() {
  const calls: RequestInit[] = [];
  const streams: Array<ReturnType<typeof createControllableStream>> = [];
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    calls.push(init ?? {});
    const signal = init?.signal as AbortSignal;
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(abortError());
      signal.addEventListener("abort", onAbort);
      Promise.resolve().then(() => {
        if (signal.aborted) return; // already rejected via onAbort
        signal.removeEventListener("abort", onAbort);
        const stream = createControllableStream(signal);
        streams.push(stream);
        resolve({ status: 200, ok: true, body: stream } as unknown as Response);
      });
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls, streams };
}

describe("SSE stream — generation guard (Fix 1)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("dispatches each frame to the subscribed handler exactly once, and aborts on unsubscribe", async () => {
    const { calls, streams } = stubFetch();
    const { subscribeToEvents } = await import("@/lib/sse");

    const handler = vi.fn();
    const unsubscribe = subscribeToEvents(handler);
    await vi.advanceTimersByTimeAsync(0); // let fetch resolve and the reader open

    streams[0].push(frame("nueva_cita", { appointment_id: 1 }));
    await vi.advanceTimersByTimeAsync(0);
    streams[0].push(frame("nueva_cita", { appointment_id: 2 }));
    await vi.advanceTimersByTimeAsync(0);

    expect(handler).toHaveBeenCalledTimes(2);

    unsubscribe();
    await vi.advanceTimersByTimeAsync(0);

    expect((calls[0].signal as AbortSignal).aborted).toBe(true);
  });

  it("survives an unsubscribe-all → resubscribe in the same tick without a zombie loop or double dispatch", async () => {
    const { fetchMock, calls, streams } = stubFetch();
    const { subscribeToEvents } = await import("@/lib/sse");

    const h1 = vi.fn();
    const h2 = vi.fn();
    const unsub1 = subscribeToEvents(h1);
    // Same tick — no await between unsub1 and the resubscribe. This is the
    // StrictMode double-mount race described in the plan (Mechanism 2).
    unsub1();
    subscribeToEvents(h2);

    await vi.advanceTimersByTimeAsync(2000);

    expect(fetchMock).toHaveBeenCalledTimes(2); // R1 + R2, no zombie reconnection
    expect(streams).toHaveLength(1); // only one connection ever "opened"
    expect((calls[1].signal as AbortSignal).aborted).toBe(false); // R2's, still live

    streams[0].push(frame("agente_actualizado"));
    await vi.advanceTimersByTimeAsync(0);

    expect(h2).toHaveBeenCalledTimes(1);
    expect(h1).not.toHaveBeenCalled();
  });
});
