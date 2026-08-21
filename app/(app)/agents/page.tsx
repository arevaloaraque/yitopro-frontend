"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, CalendarCheck2, ShoppingBag } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { useRequireAssistant } from "@/lib/business";
import { useAgents } from "@/lib/agents";
import { ApiError } from "@/lib/api";
import { AGENT_TYPE_DESCRIPTIONS } from "@/lib/consts/agent";
import { useAmbient, useHoverLift, useReveal } from "@/lib/motion";
import type { Agent, AgentType } from "@/lib/types";
import { cn } from "@/lib/utils";

// CalendarCheck2 (cita confirmada) y ShoppingBag (venta al cliente) dicen el
// RESULTADO del agente, no la categoría genérica que decían CalendarDays/Package.
const AGENT_TYPE_ICONS: Record<AgentType, LucideIcon> = {
  scheduling: CalendarCheck2,
  sales: ShoppingBag,
};

/**
 * El plan manda: sin asistente esta ruta no existe para este negocio.
 *
 * Envoltorio y no un `return` temprano dentro de `AgentsInner`, porque las reglas
 * de hooks no admiten salir antes de llamarlos — y llamarlos igual sería montar la
 * pantalla y pedir datos que el backend va a negar mientras el visitante ya está
 * saliendo. Es el mismo patrón que usa Conversaciones.
 */
export default function AgentsPage() {
  return useRequireAssistant() ? null : <AgentsInner />;
}

function AgentsInner() {
  // Agents live in the shared provider so the topbar badge reacts to toggles.
  const { agents, state, error, refetch, toggleActive: ctxToggleActive } = useAgents();
  const [actionError, setActionError] = useState<string | null>(null);

  // Movimiento de lib/motion.ts — la misma familia de gestos que la página de
  // confirmación de pago (resultviz.js): pop del icono con rebote, halo que
  // respira como estado de reposo y entrada escalonada. Reduced-motion, pausa
  // con pestaña oculta y red de seguridad vienen con los hooks.
  const gridRef = useRef<HTMLDivElement | null>(null);
  // La ENTRADA corre una sola vez: el refetch por SSE (p. ej. el propio toggle)
  // pasa por loading→ready y sin este freno la coreografía se repetiría en
  // cada cambio de switch. Se apaga DESPUÉS de que terminó (1,6 s > 560 ms de
  // tarjetas + 800 ms de iconos): apagarla en el mismo tick dispararía la
  // limpieza del hook y cortaría la animación a medias.
  const [entrance, setEntrance] = useState(true);
  useEffect(() => {
    if (state !== "ready" || !entrance) return;
    const t = setTimeout(() => setEntrance(false), 1600);
    return () => clearTimeout(t);
  }, [state, entrance]);
  useReveal(gridRef, state === "ready" && entrance);
  useAmbient(gridRef, state === "ready");
  useHoverLift(gridRef, state === "ready");

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

  if (state === "loading") return <Loading rows={5} label="Cargando agentes…" />;

  if (state === "error") {
    return (
      <div className="w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Agentes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tus agentes de IA: enciéndelos o apágalos.
          </p>
        </div>
        <ErrorState description={error ?? "Error desconocido"} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Agentes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tus agentes de IA: enciéndelos o apágalos.
        </p>
      </div>

      {actionError && (
        <p role="status" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      {agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Sin agentes"
          description="No hay agentes configurados para tu negocio."
        />
      ) : (
        // Tarjetas compactas CENTRADAS: con dos agentes, una grilla a todo el
        // ancho dejaba un vacío a la derecha; acotada y centrada, la pareja se
        // lee como el contenido de la página y no como una lista trunca.
        <div
          ref={gridRef}
          className="mx-auto grid w-full max-w-3xl gap-4 pt-2 sm:grid-cols-2"
        >
          {agents.map((agent) => {
            const Icon = AGENT_TYPE_ICONS[agent.type];
            return (
              <Card key={agent.id} data-reveal>
                <CardContent className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3.5">
                    {/* El halo pertenece al agente ACTIVO — como el sello de la
                        confirmación de pago, el brillo lo gana el estado que lo
                        merece; un inactivo queda quieto. Es decorativo
                        (aria-hidden) y no clicable: la vida nunca va sobre el
                        control. El tinte tampoco carga solo el estado — badge y
                        switch lo dicen con texto. */}
                    <span
                      className="pointer-events-none relative shrink-0"
                      aria-hidden="true"
                    >
                      {agent.is_active && (
                        <span
                          data-card-glow
                          className="absolute -inset-1.5 rounded-2xl bg-primary/25 blur-md"
                        />
                      )}
                      <span
                        data-card-icon
                        className={cn(
                          "relative flex size-12 items-center justify-center rounded-2xl transition-colors",
                          agent.is_active
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-6" />
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {agent.name}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {AGENT_TYPE_DESCRIPTIONS[agent.type]}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Switch
                      checked={agent.is_active}
                      onChange={() => toggleActive(agent)}
                      aria-label={
                        agent.is_active
                          ? `Desactivar ${agent.name}`
                          : `Activar ${agent.name}`
                      }
                    />
                    <Badge
                      variant={agent.is_active ? "success" : "secondary"}
                      className="text-xs"
                    >
                      {agent.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
