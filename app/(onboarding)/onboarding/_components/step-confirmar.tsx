"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/lib/onboarding";
import { STEP_LABELS, type OnboardingStep } from "@/lib/onboarding";

/**
 * Maps a backend `missing_steps` key to a wizard step number.
 * The backend returns coarse keys (e.g. "business", "professionals",
 * "schedule", "services", "whatsapp"); we match by keyword so the UI can offer
 * a "jump to step" button. Unknown keys fall back to step 1.
 */
function stepForMissingKey(key: string): OnboardingStep {
  const k = key.toLowerCase();
  if (k.includes("business") || k.includes("negocio")) return 1;
  if (k.includes("professional") || k.includes("profesional")) return 2;
  if (k.includes("schedule") || k.includes("horario") || k.includes("hour"))
    return 3;
  if (k.includes("service") || k.includes("servicio")) return 4;
  if (k.includes("user") || k.includes("usuario")) return 5;
  if (k.includes("whatsapp")) return 6;
  if (k.includes("agent")) return 7;
  return 1;
}

export function StepConfirmar() {
  const { data, complete, completeError, missingSteps, setCurrentStep } =
    useOnboarding();
  const [submitting, setSubmitting] = useState(false);

  async function handleComplete() {
    setSubmitting(true);
    try {
      await complete();
    } finally {
      setSubmitting(false);
    }
  }

  const summary: { label: string; value: string }[] = [
    { label: "Negocio", value: data.businessName || "—" },
    { label: "Profesionales", value: String(data.professionals.length) },
    { label: "Servicios", value: String(data.services.length) },
    { label: "Usuarios", value: String(data.users.length) },
    {
      label: "WhatsApp",
      value: data.whatsappConnected ? "Conectado" : "Sin conectar",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {summary.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border/40 p-3"
          >
            <p className="text-[0.7rem] text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-[0.95rem] font-semibold text-foreground">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {completeError ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />
            <p className="text-[0.85rem] font-medium">{completeError}</p>
          </div>
          {missingSteps.length > 0 ? (
            <ul className="space-y-2">
              {missingSteps.map((key) => {
                const step = stepForMissingKey(key);
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-[0.8rem] text-foreground">
                      {STEP_LABELS[step]}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentStep(step)}
                      data-icon="inline-end"
                    >
                      Ir al paso
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Button
        onClick={handleComplete}
        disabled={submitting}
        size="lg"
        className="w-full"
      >
        {submitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}
        Activar negocio
      </Button>
    </div>
  );
}
