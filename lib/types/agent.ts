/** Tipo / especialidad de un agente. */
export type AgentType =
  | "orchestrator"
  | "scheduling"
  | "products"
  | "records"
  | "support";

/** Nivel de autonomía del agente. */
export type AgentAutonomy = "full" | "supervised" | "manual";

/** Regla de escalamiento a un humano. */
export interface EscalationRule {
  /** Condición que dispara el escalamiento (p.ej. "cliente_molesto"). */
  condition: string;
  /** Acción a tomar (p.ej. "handoff_humano"). */
  action: string;
}

/** Agente de IA configurable. Reflejo del schema `Agent`. */
export interface Agent {
  id: string;
  business_id: string;
  name: string;
  type: AgentType;
  is_active: boolean;
  autonomy: AgentAutonomy;
  /** Capacidades habilitadas (p.ej. "agendar", "reagendar"). */
  skills: string[];
  /** Herramientas / integraciones disponibles para el agente. */
  tools: string[];
  escalation_rules: EscalationRule[];
}
