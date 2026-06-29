/** Type / specialty of an agent (mirrors the backend routes). */
export type AgentType = "scheduling" | "sales" | "records" | "human";

/** Agent autonomy level. */
export type AgentAutonomy = "full" | "supervised" | "manual";

/** Rule for escalating to a human. */
export interface EscalationRule {
  /** Condition that triggers the escalation (e.g. "cliente_molesto"). */
  condition: string;
  /** Action to take (e.g. "handoff_humano"). */
  action: string;
}

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
  escalation_rules: EscalationRule[];
}
