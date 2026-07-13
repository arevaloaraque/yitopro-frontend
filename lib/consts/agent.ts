/**
 * Shared display metadata for AI agents.
 *
 * Single source of truth for the labels the panel and the onboarding wizard
 * show for agent types, skills, tools and autonomy levels. The keys mirror the
 * backend catalog (`apps/agents/catalog.py`): only the skills/tools the backend
 * actually emits are listed; anything unknown falls back to its raw key.
 */
import type { AgentAutonomy, AgentType } from "@/lib/types";

/** Human label for each agent type (mirrors the backend catalog names). */
export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  scheduling: "Agendamiento",
  sales: "Ventas",
};

export function agentTypeLabel(type: string): string {
  return AGENT_TYPE_LABELS[type as AgentType] ?? type;
}

/** Autonomy levels with a short description of each. */
export const AUTONOMY_OPTIONS: { value: AgentAutonomy; label: string; desc: string }[] =
  [
    { value: "full", label: "Total", desc: "Sin supervisión humana" },
    {
      value: "supervised",
      label: "Supervisado",
      desc: "Requiere aprobación para acciones sensibles",
    },
    {
      value: "manual",
      label: "Manual",
      desc: "Solo responde bajo intervención humana",
    },
  ];

const SKILL_LABELS: Record<string, string> = {
  agendar: "Agendar",
  reagendar: "Reagendar",
  cancelar: "Cancelar",
  consultar_stock: "Consultar stock",
  tomar_pedido: "Tomar pedido",
};

export function skillLabel(skill: string): string {
  return SKILL_LABELS[skill] ?? skill;
}

const TOOL_LABELS: Record<string, string> = {
  calendario: "Calendario",
  servicios: "Servicios",
  catalogo: "Catálogo",
  inventario: "Inventario",
};

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}
