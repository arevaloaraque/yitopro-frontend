import type { Agent, Paginated } from "@/lib/types";

import { api } from "./client";

export async function listAgents(): Promise<Agent[]> {
  const res = await api.get<Paginated<Agent>>("/agents/");
  return res.items;
}

export function updateAgent(
  id: string,
  patch: Partial<Omit<Agent, "id" | "business_id" | "type">>,
): Promise<Agent> {
  return api.patch<Agent>(`/agents/${id}/`, patch);
}
