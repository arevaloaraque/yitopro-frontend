import { setupServer } from "msw/node";

/**
 * MSW server for tests (Node). Starts with no handlers; each test registers its
 * own with `server.use(...)`. No test touches the real backend.
 */
export const server = setupServer();
