/**
 * Capa de contrato para autenticación. Las rutas de auth NO pasan por el
 * interceptor de refresh (`skipRefresh`): en login un 401 es "credenciales
 * inválidas" y en refresh un 401 es "sesión muerta" — refrescar ahí sería
 * recursivo.
 *
 * El access token (JWE opaco) viaja en el body; el refresh token lo entrega el
 * backend como cookie httpOnly (`yitopro_refresh`, scope `/api/auth/`) y el
 * navegador la reenvía sola gracias a `credentials: "include"`.
 */
import { api } from "./client";

/** Respuesta de `/auth/login/` y `/auth/refresh/`. */
export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/** Intercambia credenciales por un access token + cookie de refresh. */
export function loginRequest(
  email: string,
  password: string,
): Promise<TokenResponse> {
  return api.post<TokenResponse>(
    "/auth/login/",
    { email, password },
    { skipRefresh: true },
  );
}

/** Rota el refresh token (vía cookie) y devuelve un access token nuevo. */
export function refreshRequest(): Promise<TokenResponse> {
  return api.post<TokenResponse>("/auth/refresh/", undefined, {
    skipRefresh: true,
  });
}

/** Revoca el refresh token y limpia la cookie en el backend (best-effort). */
export function logoutRequest(): Promise<{ detail: string }> {
  return api.post<{ detail: string }>("/auth/logout/", undefined, {
    skipRefresh: true,
  });
}
