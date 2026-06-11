/**
 * Cliente HTTP centralizado. ÚNICO punto donde la app habla con la red.
 * Los componentes nunca llaman `fetch` directo: consumen los servicios
 * tipados de `lib/api/*`, que a su vez usan este cliente.
 *
 * Al conectar el backend real (F4) no cambia nada aquí: solo se apaga MSW.
 */

/** Base del backend. En mock, MSW intercepta estas mismas URLs. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Prefijo de la API (Django Ninja monta en `/api`). */
const API_PREFIX = "/api";

/** Error tipado de la capa de red. */
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

// --- Punto de inyección de auth -------------------------------------------
// El AuthContext registra aquí cómo obtener el access token (en memoria) y
// cómo refrescar la sesión. Mientras no se registre, son no-ops seguros.

type AccessTokenGetter = () => string | null;
type SessionRefresher = () => Promise<boolean>;

let getAccessToken: AccessTokenGetter = () => null;
let refreshSession: SessionRefresher = async () => false;

/** Registra los hooks de auth. Lo llama `AuthProvider`. */
export function configureApiAuth(opts: {
  getAccessToken?: AccessTokenGetter;
  refreshSession?: SessionRefresher;
}): void {
  if (opts.getAccessToken) getAccessToken = opts.getAccessToken;
  if (opts.refreshSession) refreshSession = opts.refreshSession;
}

// --- Núcleo ----------------------------------------------------------------

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** Cuerpo JSON; se serializa automáticamente. */
  body?: unknown;
  /** Parámetros de query; los `undefined`/`null` se omiten. */
  query?: Record<string, QueryValue>;
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

/**
 * Hace una petición a la API. Lanza `ApiError` ante respuestas no-OK.
 * Ante `401`, intenta refrescar la sesión una vez y reintenta.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, query, headers, ...rest } = options;
  const url = buildUrl(path, query);

  const doRequest = async (): Promise<Response> => {
    const token = getAccessToken();
    return fetch(url, {
      ...rest,
      // El refresh token es una cookie httpOnly: siempre la enviamos.
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

  let res = await doRequest();

  // 401 -> intentar refresh una vez y reintentar.
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await doRequest();
    }
  }

  const payload = await parseBody(res);

  if (!res.ok) {
    const message =
      (typeof payload === "object" &&
        payload !== null &&
        "detail" in payload &&
        typeof (payload as { detail: unknown }).detail === "string" &&
        (payload as { detail: string }).detail) ||
      `Error ${res.status} en ${path}`;
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}

// --- Atajos por método -----------------------------------------------------

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
