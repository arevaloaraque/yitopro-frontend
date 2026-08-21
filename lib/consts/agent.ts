/**
 * Shared display metadata for AI agents.
 *
 * Single source of truth for the labels the panel and the onboarding wizard
 * show for agent types. The keys mirror the backend catalog
 * (`apps/agents/catalog.py`); anything unknown falls back to its raw key.
 */
import type { AgentType } from "@/lib/types";

/** Human label for each agent type (mirrors the backend catalog names). */
export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  scheduling: "Agendamiento",
  sales: "Ventas",
};

export function agentTypeLabel(type: string): string {
  return AGENT_TYPE_LABELS[type as AgentType] ?? type;
}

/** Qué hace cada agente, en una línea — reemplaza a las listas de skills y
 * herramientas que se mostraban antes (eliminadas del producto 2026-08-20). */
export const AGENT_TYPE_DESCRIPTIONS: Record<AgentType, string> = {
  scheduling: "Agenda, reagenda y cancela citas de tus clientes por WhatsApp.",
  sales: "Toma pedidos y responde consultas de productos y stock.",
};
