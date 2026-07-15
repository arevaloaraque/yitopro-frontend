import type { Agent, AgentAutonomy, Paginated } from "@/lib/types";

import { api } from "./client";

export async function listAgents(): Promise<Agent[]> {
  const res = await api.get<Paginated<Agent>>("/agents/");
  return res.items;
}

// The backend `AgentUpdateIn` only accepts these two fields (name/skills/tools
// come from the static catalog); anything else is silently dropped by ninja.
export function updateAgent(
  id: string,
  patch: { is_active?: boolean; autonomy?: AgentAutonomy },
): Promise<Agent> {
  return api.patch<Agent>(`/agents/${id}/`, patch);
}
