import type { Agent } from "@/lib/types";

import { api } from "./client";

export function listAgents(): Promise<Agent[]> {
  return api.get<Agent[]>("/agents");
}

export function updateAgent(
  id: string,
  patch: Partial<Omit<Agent, "id" | "business_id" | "type">>,
): Promise<Agent> {
  return api.patch<Agent>(`/agents/${id}`, patch);
}
