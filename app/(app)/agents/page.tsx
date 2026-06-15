"use client";

import { useEffect, useState } from "react";
import { Bot, Shield } from "lucide-react";

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
import { listAgents, updateAgent } from "@/lib/api/agents";
import type { Agent, AgentAutonomy, AgentType } from "@/lib/types";

type PageState = "loading" | "error" | "ready";

const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  orchestrator: "Orquestador",
  scheduling: "Agendamiento",
  products: "Productos",
  records: "Fichas",
  support: "Soporte",
};

const AGENT_TYPE_ICONS: Record<AgentType, string> = {
  orchestrator: "🧠",
  scheduling: "📅",
  products: "📦",
  records: "📋",
  support: "🎧",
};

const AUTONOMY_OPTIONS: { value: AgentAutonomy; label: string; desc: string }[] = [
  { value: "full", label: "Total", desc: "Sin supervisión humana" },
  { value: "supervised", label: "Supervisado", desc: "Requiere aprobación para acciones sensibles" },
  { value: "manual", label: "Manual", desc: "Solo responde bajo intervención humana" },
];

function skillLabel(skill: string): string {
  const map: Record<string, string> = {
    detectar_intencion: "Detectar intención",
    derivar_agente: "Derivar agente",
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

function toolLabel(tool: string): string {
  const map: Record<string, string> = {
    routing: "Enrutamiento",
    calendario: "Calendario",
    servicios: "Servicios",
    catalogo: "Catálogo",
    inventario: "Inventario",
    fichas: "Fichas",
    faq: "FAQ",
  };
  return map[tool] ?? tool;
}

export default function AgentsPage() {
  const [state, setState] = useState<PageState>("loading");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState("loading");
      setError(null);
      try {
        const data = await listAgents();
        if (!cancelled) {
          setAgents(data);
          setState("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar agentes");
          setState("error");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function refetch() {
    setState("loading");
    setError(null);
    listAgents()
      .then((data) => {
        setAgents(data);
        setState("ready");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Error al cargar agentes");
        setState("error");
      });
  }

  async function toggleActive(agent: Agent) {
    try {
      const updated = await updateAgent(agent.id, { is_active: !agent.is_active });
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch {
      // silently fail
    }
  }

  async function changeAutonomy(agent: Agent, autonomy: AgentAutonomy) {
    try {
      const updated = await updateAgent(agent.id, { autonomy });
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch {
      // silently fail
    }
  }

  if (state === "loading") return <Loading rows={5} label="Cargando agentes…" />;

  if (state === "error") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Agentes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tus agentes de IA y su configuración.</p>
        </div>
        <ErrorState description={error ?? "Error desconocido"} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Agentes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tus agentes de IA y su configuración.</p>
      </div>

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
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg">
                      {AGENT_TYPE_ICONS[agent.type]}
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
                                <span className="text-[0.6rem] text-muted-foreground">{o.desc}</span>
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
                        aria-label={agent.is_active ? "Desactivar agente" : "Activar agente"}
                      />
                      <Badge
                        variant={agent.is_active ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {agent.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setExpandedId(isExpanded ? null : agent.id)}
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
                      <Label className="text-xs text-muted-foreground">Herramientas</Label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {agent.tools.map((t) => (
                          <Badge key={t} variant="outline" className="text-[0.65rem]">
                            {toolLabel(t)}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Escalation rules */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Reglas de escalamiento</Label>
                      <div className="mt-1.5 space-y-1.5">
                        {agent.escalation_rules.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin reglas definidas.</p>
                        ) : (
                          agent.escalation_rules.map((rule, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 rounded-lg border border-border/30 px-3 py-2"
                            >
                              <Shield className="size-3.5 text-warning shrink-0" />
                              <span className="text-xs">
                                <span className="font-medium">{rule.condition}</span>
                                <span className="text-muted-foreground"> → </span>
                                <span>{rule.action}</span>
                              </span>
                            </div>
                          ))
                        )}
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
