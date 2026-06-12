"use client";

import { Bot } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getBusiness } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = "loading" | "active" | "paused" | "error";

/** Badge con el estado del asistente de IA del negocio (topbar). */
export function AssistantStatus() {
  const [status, setStatus] = useState<Status>("loading");
  const [name, setName] = useState("Asistente");

  useEffect(() => {
    let active = true;
    getBusiness()
      .then((business) => {
        if (!active) return;
        setName(business.assistant_config.display_name);
        setStatus(business.assistant_config.autonomous ? "active" : "paused");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading") {
    return <Skeleton className="hidden h-5 w-28 rounded-4xl sm:block" />;
  }
  if (status === "error") return null;

  const isActive = status === "active";
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
      {isActive ? `${name} activa` : `${name} en pausa`}
    </Badge>
  );
}
