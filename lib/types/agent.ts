/** Type / specialty of an agent (mirrors the backend routes). */
export type AgentType = "scheduling" | "sales";

/** Agent autonomy level. */
export type AgentAutonomy = "full" | "supervised" | "manual";

/** Configurable AI agent. Mirror of the `Agent` schema. */
export interface Agent {
  id: string;
  business_id: string;
  name: string;
  type: AgentType;
  is_active: boolean;
  autonomy: AgentAutonomy;
  /** Enabled capabilities (e.g. "agendar", "reagendar"). */
  skills: string[];
  /** Tools / integrations available to the agent. */
  tools: string[];
}
