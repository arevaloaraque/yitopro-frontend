import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

/**
 * Arranca el worker MSW para los dominios todavía mockeados. El emisor de
 * eventos SSE simulados se eliminó en F4-C: el tiempo real ahora es SSE real
 * contra el backend (ver `lib/sse`).
 */
export async function startMockWorker(): Promise<void> {
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: false,
  });
}
