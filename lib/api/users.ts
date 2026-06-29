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
}

const fromBackend = (u: BackendUser): SystemUser => ({
  id: String(u.id),
  email: u.email,
  role: u.role,
  is_active: u.is_active,
});

/** Lists all system users for the current business. */
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

/** Removes a user from the current business. */
export function deleteUser(id: string): Promise<void> {
  return api.delete<void>(`/users/${id}/`);
}
