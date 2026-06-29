/**
 * Contract layer for invite flows (staff onboarding).
 * Both routes are unauthenticated: a 401 here means a bad token,
 * not a dead session — so `skipRefresh` is used on accept.
 */
import { api } from "./client";

/**
 * Validates an invite token without consuming it.
 * `GET /api/auth/invite/validate/?token=<token>`
 */
export async function validateInvite(token: string): Promise<boolean> {
  return (
    await api.get<{ valid: boolean }>("/auth/invite/validate/", {
      query: { token },
      skipRefresh: true,
    })
  ).valid;
}

/** Response from `/auth/invite/accept/`. */
export interface InviteAcceptResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Accepts an invite by setting a password. Returns an access token that
 * establishes the session immediately.
 * `POST /api/auth/invite/accept/`
 */
export function acceptInvite(
  token: string,
  password: string,
): Promise<InviteAcceptResponse> {
  // skipRefresh: a 400 here is "bad token/weak password", not an expired session.
  return api.post<InviteAcceptResponse>(
    "/auth/invite/accept/",
    { token, password },
    { skipRefresh: true },
  );
}
