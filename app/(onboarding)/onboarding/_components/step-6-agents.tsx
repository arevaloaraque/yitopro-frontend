"use client";

import { useState } from "react";

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
    scheduling: "Agendamiento",
    sales: "Ventas",
    records: "Fichas",
    human: "Humano",
  };
  return map[type] ?? type;
}

export function Step6Agents() {
  const { data, toggleAgent, setAgentAutonomy } = useOnboarding();
  const [error, setError] = useState<string | null>(null);

  function run(promise: Promise<void>) {
    setError(null);
    promise.catch((err: unknown) => {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el agente.",
      );
    });
  }

  if (data.agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No hay agentes disponibles para tu plan todavía.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-[0.8rem] text-destructive">
          {error}
        </p>
      ) : null}

      {data.agents.map((agent) => (
        <div key={agent.type} className="rounded-xl border border-border/40 p-4">
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
                onChange={(checked) => run(toggleAgent(agent.type, checked))}
              />
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <Label className="text-xs">Autonomía</Label>
            <Select
              value={agent.autonomy}
              onValueChange={(v) =>
                run(setAgentAutonomy(agent.type, v as AgentAutonomy))
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

          {agent.skills.length > 0 ? (
            <div className="mt-3">
              <Label className="text-xs">Skills</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {agent.skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="outline"
                    className="text-[0.65rem]"
                  >
                    {skillLabel(skill)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
