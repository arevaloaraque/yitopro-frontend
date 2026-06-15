"use client";

import { useState } from "react";
import {
  Bot,
  Building2,
  Check,
  Loader2,
  MessageSquare,
  Package,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOnboarding } from "@/lib/onboarding";

export function Step9Activation() {
  const { data, activate, activateError } = useOnboarding();
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(data.activated);
  const [error, setError] = useState<string | null>(activateError);

  const handleActivate = async () => {
    setActivating(true);
    setError(null);
    try {
      await activate();
      setActivated(true);
    } catch {
      setError(activateError ?? "Error al activar el negocio. Intenta de nuevo.");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-[0.8rem] text-muted-foreground">
        Revisa el resumen de tu configuración y activa tu negocio. Al activarlo,
        tu asistente IA comenzará a atender clientes por WhatsApp.
      </p>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          icon={Building2}
          label="Negocio"
          value={data.businessName || "Sin nombre"}
        />
        <SummaryCard
          icon={Wrench}
          label="Servicios"
          value={`${data.services.length} configurados`}
        />
        <SummaryCard
          icon={Package}
          label="Productos"
          value={`${data.products.length} en catálogo`}
        />
        <SummaryCard
          icon={Bot}
          label="Agentes IA"
          value={`${data.agents.length} configurados`}
        />
        <SummaryCard
          icon={MessageSquare}
          label="WhatsApp"
          value={data.whatsappConnected ? "Conectado" : "No conectado"}
        />
      </div>

      <div className="flex justify-center pt-4">
        {activated ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-success/10 text-success ring-1 ring-success/20">
              <Check className="size-6" />
            </div>
            <p className="text-[0.95rem] font-semibold text-foreground">
              ¡Negocio activado!
            </p>
            <p className="text-[0.8rem] text-muted-foreground">
              Redirigiendo al dashboard...
            </p>
          </div>
        ) : (
          <Button onClick={handleActivate} disabled={activating} size="lg">
            {activating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Activando...
              </>
            ) : (
              "Activar negocio"
            )}
          </Button>
        )}
        {error && (
          <p className="mt-3 text-center text-[0.8rem] text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card size="sm" className="bg-muted/30">
      <CardContent className="flex items-center gap-3 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-border/30">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.65rem] text-muted-foreground">{label}</p>
          <p className="truncate text-[0.8rem] font-semibold text-foreground">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
