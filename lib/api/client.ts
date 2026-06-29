/**
 * Centralized HTTP client. The ONLY place where the app talks to the network.
 * Components never call `fetch` directly: they consume the typed services in
 * `lib/api/*`, which in turn use this client.
 *
 * All network traffic goes to the real Django backend (`NEXT_PUBLIC_API_URL`);
 * there are no runtime mocks. MSW is only used in tests.
 */

/** Django backend base. Defaults to the local port API_PORT=8050. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8050";

/** API prefix (Django Ninja mounts at `/api`). */
const API_PREFIX = "/api";

/** Typed error from the network layer. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// --- Auth injection point --------------------------------------------------
// The AuthContext registers here how to obtain the access token (in memory) and
// how to refresh the session. Until registered, they are safe no-ops.

type AccessTokenGetter = () => string | null;
type SessionRefresher = () => Promise<boolean>;
type SessionExpiredHandler = () => void;

let getAccessToken: AccessTokenGetter = () => null;
let refreshSession: SessionRefresher = async () => false;
let onSessionExpired: SessionExpiredHandler = () => {};

/** Registers the auth hooks. Called by `AuthProvider`. */
export function configureApiAuth(opts: {
  getAccessToken?: AccessTokenGetter;
  refreshSession?: SessionRefresher;
  onSessionExpired?: SessionExpiredHandler;
}): void {
  if (opts.getAccessToken) getAccessToken = opts.getAccessToken;
  if (opts.refreshSession) refreshSession = opts.refreshSession;
  if (opts.onSessionExpired) onSessionExpired = opts.onSessionExpired;
}

// --- Core --------------------------------------------------------------------

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** JSON body; serialized automatically. */
  body?: unknown;
  /** Query parameters; `undefined`/`null` values are omitted. */
  query?: Record<string, QueryValue>;
  /**
   * Skips the refresh interceptor on 401. Used by the auth routes themselves:
   * on `/login` a 401 means "invalid credentials" (no need to refresh) and on
   * `/refresh` a 401 means "dead session" (refreshing would cause recursion).
   */
  skipRefresh?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${API_PREFIX}${path}`, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function extractErrorMessage(
  payload: unknown,
  status: number,
  path: string,
): string {
  if (payload && typeof payload === "object") {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0 && typeof detail[0] === "object" && detail[0] !== null) {
      const first = detail[0] as Record<string, unknown>;
      if (typeof first.msg === "string") return String(first.msg);
    }
    const firstField = Object.values(payload as Record<string, unknown>)[0];
    if (Array.isArray(firstField) && typeof firstField[0] === "string")
      return String(firstField[0]);
  }
  return `Error ${status} en ${path}`;
}

// Single-flight: a single refresh even if N requests receive a 401 at once.
let refreshInFlight: Promise<boolean> | null = null;
const refreshOnce = () =>
  (refreshInFlight ??= refreshSession().finally(() => {
    refreshInFlight = null;
  }));

// --- Auth for the SSE stream -------------------------------------------------
// The SSE stream goes through `fetch` (not `EventSource`) because the backend
// authenticates via Bearer header and the access token lives in memory;
// `EventSource` cannot send headers. `lib/sse` reuses these hooks already
// configured by AuthProvider.

/** Current access token (in memory), for the SSE stream header. */
export function peekAccessToken(): string | null {
  return getAccessToken();
}

/** Refreshes the session once (single-flight shared with `apiFetch`). */
export function refreshAuthOnce(): Promise<boolean> {
  return refreshOnce();
}

/**
 * Makes a request to the API. Throws `ApiError` on non-OK responses.
 * On `401`, it tries to refresh the session once (single-flight) and retries.
 * If the refresh fails, it fires `onSessionExpired`.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, query, headers, skipRefresh, ...rest } = options;
  const url = buildUrl(path, query);

  const doRequest = async (): Promise<Response> => {
    const token = getAccessToken();
    return fetch(url, {
      ...rest,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res: Response;
  try {
    res = await doRequest();
  } catch {
    throw new ApiError(0, "Error de red", null);
  }

  if (res.status === 401 && !skipRefresh) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      try {
        res = await doRequest();
      } catch {
        throw new ApiError(0, "Error de red", null);
      }
    } else {
      onSessionExpired();
      throw new ApiError(401, "Sesion expirada", null);
    }
  }

  const payload = await parseBody(res);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      extractErrorMessage(payload, res.status, path),
      payload,
    );
  }

  return payload as T;
}

// --- Shortcuts by method -----------------------------------------------------

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};
