/**
 * Contract layer for authentication. Auth routes do NOT go through the refresh
 * interceptor (`skipRefresh`): on login a 401 means "invalid credentials" and
 * on refresh a 401 means "dead session" — refreshing there would be recursive.
 *
 * The access token (opaque JWE) travels in the body; the backend delivers the
 * refresh token as an httpOnly cookie (`yitopro_refresh`, scope `/api/auth/`)
 * and the browser resends it on its own thanks to `credentials: "include"`.
 */
import { api } from "./client";

/** Response from `/auth/login/` and `/auth/refresh/`. */
export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/** Exchanges credentials for an access token + refresh cookie. */
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

/** Rotates the refresh token (via cookie) and returns a new access token. */
export function refreshRequest(): Promise<TokenResponse> {
  return api.post<TokenResponse>("/auth/refresh/", undefined, {
    skipRefresh: true,
  });
}

/** Revokes the refresh token and clears the cookie on the backend (best-effort). */
export function logoutRequest(): Promise<{ detail: string }> {
  return api.post<{ detail: string }>("/auth/logout/", undefined, {
    skipRefresh: true,
  });
}

/** Authenticated user's profile (to reconstruct the visible identity). */
export interface MeResponse {
  id: string;
  email: string;
  name: string;
}

/**
 * Returns the user profile for the current access token (`GET /api/auth/me/`).
 * Used by startup (after a silent refresh) and by login to set the real
 * identity, instead of deriving it from the form email.
 */
export function getMe(): Promise<MeResponse> {
  return api.get<MeResponse>("/auth/me/");
}

// --- Password reset --------------------------------------------------------
// All three routes are unauthenticated and use `skipRefresh` (a 401 here is not
// a dead session). The request endpoint never reveals whether the email exists,
// so the UI always shows the same generic confirmation.

/** Generic `{ detail }` response from the reset request/confirm endpoints. */
export interface GenericDetailResponse {
  detail: string;
}

/**
 * Requests a password-reset email. Resolves the same way for any input — the
 * backend doesn't disclose whether the address belongs to an account. A 429
 * (`ApiError`) means the IP hit the abuse throttle.
 */
export function requestPasswordReset(
  email: string,
): Promise<GenericDetailResponse> {
  return api.post<GenericDetailResponse>(
    "/auth/password/reset/request/",
    { email },
    { skipRefresh: true },
  );
}

/** Checks whether a reset token is still usable, without consuming it. */
export function validateResetToken(token: string): Promise<{ valid: boolean }> {
  return api.get<{ valid: boolean }>("/auth/password/reset/validate/", {
    query: { token },
    skipRefresh: true,
  });
}

/**
 * Sets a new password using a reset token. Throws `ApiError` with status 400
 * when the token is invalid/expired or the password fails the policy (the
 * message is safe to show).
 */
export function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<GenericDetailResponse> {
  return api.post<GenericDetailResponse>(
    "/auth/password/reset/confirm/",
    { token, new_password: newPassword },
    { skipRefresh: true },
  );
}
