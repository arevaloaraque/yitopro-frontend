"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { agentTypeLabel } from "@/lib/consts/agent";
import { useOnboarding } from "@/lib/onboarding";

export function Step6Agents() {
  const { data, toggleAgent } = useOnboarding();
  const [error, setError] = useState<string | null>(null);

  function run(promise: Promise<void>) {
    setError(null);
    promise.catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el agente.");
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
        </div>
      ))}
    </div>
  );
}
