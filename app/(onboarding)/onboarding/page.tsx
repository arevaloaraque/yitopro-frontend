"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, Loading } from "@/components/states";
import {
  OnboardingProvider,
  useOnboarding,
  type OnboardingStep,
  STEP_LABELS,
  TOTAL_STEPS,
} from "@/lib/onboarding";

import { Step1BusinessInfo } from "./_components/step-1-business-info";
import { StepProfesionales } from "./_components/step-profesionales";
import { StepHorarios } from "./_components/step-horarios";
import { Step3Services } from "./_components/step-3-services";
import { StepUsuarios } from "./_components/step-usuarios";
import { Step7WhatsApp } from "./_components/step-7-whatsapp";
import { Step6Agents } from "./_components/step-6-agents";
import { StepConfirmar } from "./_components/step-confirmar";
import { Stepper } from "./_components/stepper";

/**
 * Per-step gating validation. Returns an error message or `null` if the step
 * may be left. Steps map to STEP_LABELS:
 *   1 Negocio · 2 Profesionales · 3 Horarios · 4 Servicios ·
 *   5 Usuarios · 6 WhatsApp · 7 Agentes · 8 Confirmar
 */
function validateStep(
  step: OnboardingStep,
  ctx: ReturnType<typeof useOnboarding>,
): string | null {
  const { data } = ctx;

  switch (step) {
    case 1:
      if (!data.businessName.trim())
        return "El nombre del negocio es obligatorio.";
      if (!data.country) return "Selecciona un país.";
      if (!data.currency) return "Selecciona una moneda.";
      if (!data.language) return "Selecciona un idioma.";
      if (!data.timezone) return "Selecciona una zona horaria.";
      return null;

    case 2:
      if (!data.professionals.some((p) => p.name.trim()))
        return "Agrega al menos un profesional con nombre.";
      return null;

    case 3:
      if (data.weeklySchedule.length === 0)
        return "Define un horario y aplícalo a todos los profesionales.";
      return null;

    case 4:
      if (data.services.length === 0) return "Agrega al menos un servicio.";
      if (data.services.some((s) => !s.name.trim()))
        return "Todos los servicios deben tener un nombre.";
      if (
        data.services.some(
          (s) => Number.isNaN(s.duration_minutes) || s.duration_minutes <= 0,
        )
      )
        return "Todos los servicios deben tener una duración válida.";
      if (data.services.some((s) => Number.isNaN(s.price) || s.price < 0))
        return "Todos los servicios deben tener un precio válido.";
      return null;

    case 5:
      return null; // Usuarios — optional

    case 6:
      if (!data.whatsappConnected) return "Conecta WhatsApp antes de continuar.";
      return null;

    case 7:
      return null; // Agentes — none required

    case 8:
      return null; // Confirmar — terminal

    default:
      return null;
  }
}

function stepTitle(step: OnboardingStep): string {
  switch (step) {
    case 1:
      return "Datos del negocio";
    case 2:
      return "Profesionales";
    case 3:
      return "Horarios de atención";
    case 4:
      return "Servicios";
    case 5:
      return "Usuarios";
    case 6:
      return "Conectar WhatsApp";
    case 7:
      return "Agentes";
    case 8:
      return "Confirmar y activar";
  }
}

function OnboardingWizard() {
  const ctx = useOnboarding();
  const { currentStep, setCurrentStep, goNext, goBack, loading, loadError } =
    ctx;

  const [completedSteps, setCompletedSteps] = useState<Set<OnboardingStep>>(
    new Set(),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // One-time init: after rehydration, mark already-satisfied steps complete and
  // jump to the first pending step (or Confirmar if all are satisfied).
  useEffect(() => {
    if (loading || initialized) return;
    const completed = new Set<OnboardingStep>();
    (
      [1, 2, 3, 4, 5, 6, 7] as OnboardingStep[]
    ).forEach((s) => {
      if (validateStep(s, ctx) === null) completed.add(s);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading guard pattern
    setCompletedSteps(completed);
    const firstPending =
      ([1, 2, 3, 4, 5, 6, 7, 8] as OnboardingStep[]).find(
        (s) => validateStep(s, ctx) !== null,
      ) ?? 8;
    setCurrentStep(firstPending);
    setInitialized(true);
  }, [loading, initialized, ctx, setCurrentStep]);

  const handleNext = useCallback(() => {
    const error = validateStep(currentStep, ctx);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setCompletedSteps((prev) => new Set(prev).add(currentStep));
    goNext();
  }, [currentStep, ctx, goNext]);

  const handleStepClick = useCallback(
    (step: OnboardingStep) => {
      if (completedSteps.has(step) || step < currentStep) {
        setValidationError(null);
        setCurrentStep(step);
      }
    },
    [completedSteps, currentStep, setCurrentStep],
  );

  const stepComponent = useMemo(() => {
    switch (currentStep) {
      case 1:
        return <Step1BusinessInfo />;
      case 2:
        return <StepProfesionales />;
      case 3:
        return <StepHorarios />;
      case 4:
        return <Step3Services />;
      case 5:
        return <StepUsuarios />;
      case 6:
        return <Step7WhatsApp />;
      case 7:
        return <Step6Agents />;
      case 8:
        return <StepConfirmar />;
    }
  }, [currentStep]);

  if (loading || !initialized) {
    return <Loading rows={5} label="Cargando el onboarding…" />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="No pudimos cargar el onboarding"
        description={loadError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <>
      <Stepper
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={handleStepClick}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{stepTitle(currentStep)}</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[320px]">{stepComponent}</CardContent>
      </Card>

      {validationError && (
        <p className="mt-3 text-center text-[0.8rem] text-destructive">
          {validationError}
        </p>
      )}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={currentStep === 1}
          data-icon="inline-start"
        >
          <ArrowLeft className="size-4" />
          Anterior
        </Button>

        <span className="text-[0.75rem] text-muted-foreground">
          Paso {currentStep} de {TOTAL_STEPS} · {STEP_LABELS[currentStep]}
        </span>

        {currentStep !== TOTAL_STEPS && (
          <Button onClick={handleNext} data-icon="inline-end">
            Siguiente
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <OnboardingProvider>
      <OnboardingWizard />
    </OnboardingProvider>
  );
}
