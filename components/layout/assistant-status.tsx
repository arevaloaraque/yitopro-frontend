"use client";

import { Bot } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgents } from "@/lib/agents";
import { useBusiness } from "@/lib/business";
import { cn } from "@/lib/utils";

/** Badge con el estado del asistente de IA del negocio (topbar). */
export function AssistantStatus() {
  // Business and agents come from the shared providers, so saving a setting
  // or toggling an agent updates this badge instantly — no extra backend call.
  const { business, state: bizState } = useBusiness();
  const { hasActiveAgents, state: agentsState } = useAgents();

  if (bizState === "loading" || agentsState === "loading") {
    return <Skeleton className="hidden h-5 w-28 rounded-4xl sm:block" />;
  }
  if (bizState === "error" || !business) return null;
  // Sin asistente en el plan no hay nada que informar: un badge que dice "en
  // pausa" para siempre se lee como producto a medio instalar, no como plan.
  if (business.entitlements?.assistant === false) return null;

  // "Activa" only when the business is live (is_operative: active AND
  // status === "active") AND at least one agent is enabled — with no enabled
  // agents the assistant doesn't reply (WhatsApp pause gate).
  const isActive = business.is_operative && hasActiveAgents;
  return (
    <Badge
      className={cn(
        "hidden sm:inline-flex",
        isActive
          ? "bg-accent text-accent-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      <Bot />
      <span>
        {business.assistant_config.display_name}{" "}
        {/* Sin ancho reservado: el hueco fijo que había (`min-w-[3.75rem]`) más
            `text-left` dejaba todo el sobrante a la derecha, y el badge salía
            descentrado — medido: 35,6 px de margen derecho contra 11 del
            izquierdo con «activa», porque la palabra ocupa 35,4 de los 60 px
            reservados. Ahora el ancho lo da el contenido y los márgenes son los
            del propio Badge, iguales a los dos lados.

            Se reservaba para que el badge no cambiara de ancho al alternar
            activa/pausa, pero el contenedor del topbar es `ml-auto flex`: está
            anclado a la derecha, así que el badge crece hacia la IZQUIERDA y
            ni el tema, ni la campana, ni el avatar se mueven. La estabilidad que
            el hueco protegía ya la daba el layout.

            El <span> se queda —aunque no lleve clases— porque envuelve solo la
            palabra de estado y cuatro tests la buscan por texto exacto. */}
        <span>{isActive ? "activa" : "en pausa"}</span>
      </span>
    </Badge>
  );
}
