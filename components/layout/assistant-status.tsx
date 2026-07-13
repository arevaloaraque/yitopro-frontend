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
        {/* Fixed-width status word so toggling active/paused keeps the badge a
            constant width and doesn't shift the rest of the topbar. */}
        <span className="inline-block min-w-[3.75rem] text-left">
          {isActive ? "activa" : "en pausa"}
        </span>
      </span>
    </Badge>
  );
}
