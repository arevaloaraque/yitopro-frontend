"use client";

import { Sparkles } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBusinessOptional } from "@/lib/business/business-context";
import { cn } from "@/lib/utils";

/**
 * El plan contratado, al pie de la barra lateral.
 *
 * Es el mismo objeto `entitlements` que ya gobierna qué se ve en el panel, así
 * que el nombre del plan y lo que el panel muestra no pueden discrepar: salen
 * del mismo dato.
 *
 * El detalle va en el tooltip y no en la barra porque los topes son la parte que
 * de verdad se necesita —hoy un negocio descubre su techo de profesionales
 * recién cuando intenta crear el que sobra— pero no algo que haya que leer en
 * cada pantalla.
 */
export function PlanBadge({ collapsed = false }: { collapsed?: boolean }) {
  const business = useBusinessOptional()?.business ?? null;
  const ent = business?.entitlements;

  // Sin plan registrado no se inventa una etiqueta: la enorme mayoría de los
  // negocios que existen hoy están en ese estado, y decirles "Sin plan" a
  // clientes que pagan sería alarmante además de falso.
  if (!ent?.plan_name) return null;

  // Con los contadores del backend la línea dice el consumo real («2 de 6»),
  // que es lo que deja ver un sobre-cupo heredado sin abrir ninguna pantalla.
  const topes = [
    ent.max_agents ? `${ent.max_agents} agente(s) IA a la vez` : null,
    ent.max_professionals
      ? `${ent.active_professionals} de ${ent.max_professionals} profesionales`
      : null,
    ent.max_users ? `${ent.active_users} de ${ent.max_users} personas con acceso` : null,
  ].filter(Boolean);
  const sobreCupo =
    (ent.max_professionals > 0 && ent.active_professionals > ent.max_professionals) ||
    (ent.max_users > 0 && ent.active_users > ent.max_users);

  return (
    <div
      className={cn(
        "shrink-0 border-t border-sidebar-border/40",
        collapsed ? "px-3 py-3" : "px-3 py-3.5",
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className={cn(
                "flex cursor-default items-center rounded-md text-[0.7rem] font-medium text-sidebar-foreground/70",
                collapsed ? "justify-center" : "gap-2 px-2",
              )}
            >
              <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
              {!collapsed && (
                <span className="truncate">
                  Plan <span className="text-sidebar-foreground">{ent.plan_name}</span>
                </span>
              )}
            </div>
          }
        />
        {/* El popup por defecto es una fila centrada, pensada para una sola
            línea; acá son tres, así que se apilan. */}
        <TooltipContent side="right" className="flex-col items-start gap-0.5 py-2">
          <p className="font-medium">Plan {ent.plan_name}</p>
          <p className="text-xs opacity-80">
            {ent.assistant
              ? "Con asistente en tu WhatsApp"
              : "Solo panel, sin asistente"}
          </p>
          {topes.length > 0 && (
            <p className="text-xs opacity-80">{topes.join(" · ")}</p>
          )}
          {sobreCupo && (
            <p className="text-xs font-medium text-destructive">
              Estás sobre el límite de tu plan
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
