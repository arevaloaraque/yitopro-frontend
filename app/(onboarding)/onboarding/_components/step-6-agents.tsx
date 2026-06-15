"use client";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useOnboarding } from "@/lib/onboarding";
import type { AgentAutonomy } from "@/lib/types";

const ALL_SKILLS = [
  "detectar_intencion",
  "derivar_agente",
  "agendar",
  "reagendar",
  "cancelar",
  "consultar_stock",
  "tomar_pedido",
  "leer_ficha",
  "actualizar_ficha",
  "responder_faq",
];

const AUTONOMY_OPTIONS: { value: AgentAutonomy; label: string }[] = [
  { value: "full", label: "Total (sin supervisión)" },
  { value: "supervised", label: "Supervisado" },
  { value: "manual", label: "Manual" },
];

function skillLabel(skill: string): string {
  const map: Record<string, string> = {
    detectar_intencion: "Detectar intención",
    derivar_agente: "Derivar a otro agente",
    agendar: "Agendar",
    reagendar: "Reagendar",
    cancelar: "Cancelar",
    consultar_stock: "Consultar stock",
    tomar_pedido: "Tomar pedido",
    leer_ficha: "Leer ficha",
    actualizar_ficha: "Actualizar ficha",
    responder_faq: "Responder FAQ",
  };
  return map[skill] ?? skill;
}

function agentTypeLabel(type: string): string {
  const map: Record<string, string> = {
    orchestrator: "Orquestador",
    scheduling: "Agendamiento",
    products: "Productos",
    records: "Fichas",
    support: "Soporte",
  };
  return map[type] ?? type;
}

export function Step6Agents() {
  const { data, updateAgent, toggleAgentSkill } = useOnboarding();

  if (data.agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Selecciona una industria en el paso 2 para generar agentes automáticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.agents.map((agent) => (
        <div
          key={agent.id}
          className="rounded-xl border border-border/40 p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.85rem] font-semibold text-foreground">
                {agent.name}
              </p>
              <p className="text-[0.7rem] text-muted-foreground">
                {agentTypeLabel(agent.type)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Activo</Label>
              <Switch
                checked={agent.is_active}
                onChange={(checked) =>
                  updateAgent(agent.id, { is_active: checked })
                }
              />
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <Label className="text-xs">Autonomía</Label>
            <Select
              value={agent.autonomy}
              onValueChange={(v) =>
                updateAgent(agent.id, { autonomy: v as AgentAutonomy })
              }
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {AUTONOMY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3">
            <Label className="text-xs">Skills</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ALL_SKILLS.map((skill) => {
                const active = agent.skills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleAgentSkill(agent.id, skill)}
                    className="cursor-pointer"
                  >
                    <Badge
                      variant={active ? "default" : "outline"}
                      className="text-[0.65rem] transition-colors"
                    >
                      {skillLabel(skill)}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
