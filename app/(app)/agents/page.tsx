"use client";

import { useState } from "react";
import { Bot, CalendarDays, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { useAgents } from "@/lib/agents";
import { ApiError } from "@/lib/api";
import {
  AGENT_TYPE_LABELS,
  AUTONOMY_OPTIONS,
  skillLabel,
  toolLabel,
} from "@/lib/consts/agent";
import type { Agent, AgentAutonomy, AgentType } from "@/lib/types";

const AGENT_TYPE_ICONS: Record<AgentType, LucideIcon> = {
  scheduling: CalendarDays,
  sales: Package,
};

export default function AgentsPage() {
  // Agents live in the shared provider so the topbar badge reacts to toggles.
  const {
    agents,
    state,
    error,
    refetch,
    toggleActive: ctxToggleActive,
    changeAutonomy: ctxChangeAutonomy,
  } = useAgents();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function toggleActive(agent: Agent) {
    setActionError(null);
    try {
      await ctxToggleActive(agent);
    } catch (err) {
      // A 403 here is an entitlement rejection with an already-Spanish,
      // user-facing message from the backend — surface it instead of hiding it.
      setActionError(
        err instanceof ApiError && err.status === 403
          ? err.message
          : "No se pudo cambiar el estado del agente.",
      );
    }
  }

  async function changeAutonomy(agent: Agent, autonomy: AgentAutonomy) {
    setActionError(null);
    try {
      await ctxChangeAutonomy(agent, autonomy);
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 403
          ? err.message
          : "No se pudo cambiar la autonomia del agente.",
      );
    }
  }

  if (state === "loading") return <Loading rows={5} label="Cargando agentes…" />;

  if (state === "error") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Agentes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tus agentes de IA y su configuración.
          </p>
        </div>
        <ErrorState description={error ?? "Error desconocido"} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Agentes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tus agentes de IA y su configuración.
        </p>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Sin agentes"
          description="No hay agentes configurados para tu negocio."
        />
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => {
            const isExpanded = expandedId === agent.id;
            return (
              <Card key={agent.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      {(() => {
                        const Icon = AGENT_TYPE_ICONS[agent.type];
                        return <Icon className="size-5" />;
                      })()}
                    </span>
                    <div>
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      <p className="text-[0.75rem] text-muted-foreground">
                        {AGENT_TYPE_LABELS[agent.type]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select
                      value={agent.autonomy}
                      onValueChange={(v) => changeAutonomy(agent, v as AgentAutonomy)}
                    >
                      <SelectTrigger size="sm" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {AUTONOMY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              <span className="flex flex-col">
                                <span>{o.label}</span>
                                <span className="text-[0.6rem] text-muted-foreground">
                                  {o.desc}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={agent.is_active}
                        onChange={() => toggleActive(agent)}
                        aria-label={
                          agent.is_active ? "Desactivar agente" : "Activar agente"
                        }
                      />
                      <Badge
                        variant={agent.is_active ? "success" : "secondary"}
                        className="min-w-[4.5rem] text-xs"
                      >
                        {agent.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setExpandedId(isExpanded ? null : agent.id)}
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded
                          ? `Ocultar detalle de ${agent.name}`
                          : `Ver detalle de ${agent.name}`
                      }
                    >
                      {isExpanded ? "Ocultar" : "Detalle"}
                    </Button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4 border-t border-border/40 pt-4">
                    {/* Skills */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Skills</Label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {agent.skills.map((s) => (
                          <Badge key={s} variant="default" className="text-[0.65rem]">
                            {skillLabel(s)}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Tools */}
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Herramientas
                      </Label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {agent.tools.map((t) => (
                          <Badge key={t} variant="outline" className="text-[0.65rem]">
                            {toolLabel(t)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
