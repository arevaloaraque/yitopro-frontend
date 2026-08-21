import type { Agent, Paginated } from "@/lib/types";

import { api } from "./client";

export async function listAgents(): Promise<Agent[]> {
  const res = await api.get<Paginated<Agent>>("/agents/");
  return res.items;
}

// `is_active` es lo único que el tenant edita: el nombre viene del catálogo
// estático, y autonomía/skills/herramientas se eliminaron del producto.
export function updateAgent(id: string, patch: { is_active: boolean }): Promise<Agent> {
  return api.patch<Agent>(`/agents/${id}/`, patch);
}
