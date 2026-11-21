import type { SystemUser } from "@/lib/types";

import { api } from "./client";

/**
 * Backend shape for a system user. The `id` is an integer on the backend;
 * we coerce it to `string` in the mapping layer.
 */
interface BackendUser {
  id: number;
  email: string;
  role: "owner" | "staff";
  is_active: boolean;
  created_at: string;
  deactivated_by_plan: boolean;
}

const fromBackend = (u: BackendUser): SystemUser => ({
  id: String(u.id),
  email: u.email,
  role: u.role,
  is_active: u.is_active,
  created_at: u.created_at,
  deactivated_by_plan: u.deactivated_by_plan,
});

/**
 * Lists ALL system users of the current business, inactive ones included.
 * Deliberately unfiltered (2026-08-19): the team screen needs the deactivated
 * seats to offer "reactivar" after a plan downgrade — hiding them here made
 * that flow impossible. Callers that only want the active ones filter locally.
 */
export async function listUsers(): Promise<SystemUser[]> {
  return (await api.get<BackendUser[]>("/users/")).map(fromBackend);
}

/** Invites a new user by email, assigning the given role. */
export async function inviteUser(input: {
  email: string;
  role: "owner" | "staff";
}): Promise<SystemUser> {
  return fromBackend(
    await api.post<BackendUser>("/users/", { email: input.email, role: input.role }),
  );
}

/** Deactivates a user (the backend never deletes; the seat is freed). */
export function deleteUser(id: string): Promise<void> {
  return api.delete<void>(`/users/${id}/`);
}

/**
 * Reactivates a deactivated user. The backend re-checks the plan's seat cap
 * (403 with a clear message when full) — swapping = deactivate one, activate
 * another.
 */
export async function activateUser(id: string): Promise<SystemUser> {
  return fromBackend(await api.post<BackendUser>(`/users/${id}/activate/`, {}));
}
