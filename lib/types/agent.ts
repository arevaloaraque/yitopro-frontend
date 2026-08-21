/** Type / specialty of an agent (mirrors the backend routes). */
export type AgentType = "scheduling" | "sales";

/** Configurable AI agent. Mirror of the `Agent` schema.
 *
 * Autonomía, skills y herramientas se eliminaron del producto (2026-08-20):
 * los agentes operan siempre con autonomía total, sus capacidades las define
 * el catálogo del backend, y lo único configurable es prenderlos o apagarlos.
 * El backend elimina los campos por su lado. */
export interface Agent {
  id: string;
  business_id: string;
  name: string;
  type: AgentType;
  is_active: boolean;
}
