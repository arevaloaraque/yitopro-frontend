import { setupServer } from "msw/node";

/**
 * Servidor MSW para tests (Node). Empieza sin handlers; cada test registra los
 * suyos con `server.use(...)`. Ningún test toca el backend real.
 */
export const server = setupServer();
