"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  OnboardingProvider,
  useOnboarding,
  type OnboardingStep,
  TOTAL_STEPS,
} from "@/lib/onboarding";

import { Step1BusinessInfo } from "./_components/step-1-business-info";
import { Step2Template } from "./_components/step-2-template";
import { Step3Services } from "./_components/step-3-services";
import { Step4Products } from "./_components/step-4-products";
import { Step5Records } from "./_components/step-5-records";
import { Step6Agents } from "./_components/step-6-agents";
import { Step7WhatsApp } from "./_components/step-7-whatsapp";
import { Step8Test } from "./_components/step-8-test";
import { Step9Activation } from "./_components/step-9-activation";
import { Stepper } from "./_components/stepper";

function validateStep(
  step: OnboardingStep,
  ctx: ReturnType<typeof useOnboarding>,
): string | null {
  const { data } = ctx;

  switch (step) {
    case 1:
      if (!data.businessName.trim()) return "El nombre del negocio es obligatorio.";
      if (!data.country) return "Selecciona un país.";
      if (!data.currency) return "Selecciona una moneda.";
      if (!data.language) return "Selecciona un idioma.";
      if (!data.timezone) return "Selecciona una zona horaria.";
      return null;

    case 2:
      if (!data.selectedTemplate) return "Selecciona una industria/template.";
      return null;

    case 3:
      if (data.services.some((s) => !s.name.trim()))
        return "Todos los servicios deben tener un nombre.";
      if (data.services.some((s) => s.duration_minutes <= 0))
        return "Todos los servicios deben tener una duración válida.";
      return null;

    case 5:
      if (data.recordFields.some((f) => !f.label.trim()))
        return "Todos los campos de ficha deben tener un label.";
      if (data.recordFields.some((f) => !f.name.trim()))
        return "Todos los campos de ficha deben tener un nombre interno.";
      return null;

    case 7:
      if (!data.whatsappConnected)
        return "Conecta WhatsApp antes de continuar.";
      return null;

    case 8:
      return null; // No validation needed for test step

    default:
      return null;
  }
}

function OnboardingWizard() {
  const ctx = useOnboarding();
  const { currentStep, setCurrentStep, goNext, goBack } = ctx;

  const [completedSteps, setCompletedSteps] = useState<Set<OnboardingStep>>(
    new Set(),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

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
        return <Step2Template />;
      case 3:
        return <Step3Services />;
      case 4:
        return <Step4Products />;
      case 5:
        return <Step5Records />;
      case 6:
        return <Step6Agents />;
      case 7:
        return <Step7WhatsApp />;
      case 8:
        return <Step8Test />;
      case 9:
        return <Step9Activation />;
    }
  }, [currentStep]);

  return (
    <>
      <Stepper
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={handleStepClick}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {getStepTitle(currentStep)}
          </CardTitle>
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
          Paso {currentStep} de {TOTAL_STEPS}
        </span>

        {currentStep !== 9 && (
          <Button onClick={handleNext} data-icon="inline-end">
            Siguiente
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </>
  );
}

function getStepTitle(step: OnboardingStep): string {
  switch (step) {
    case 1:
      return "Datos del negocio";
    case 2:
      return "Selecciona tu industria";
    case 3:
      return "Servicios";
    case 4:
      return "Productos";
    case 5:
      return "Fichas de clientes";
    case 6:
      return "Agentes y skills";
    case 7:
      return "Conectar WhatsApp";
    case 8:
      return "Prueba";
    case 9:
      return "Activar negocio";
  }
}

export default function OnboardingPage() {
  return (
    <OnboardingProvider>
      <OnboardingWizard />
    </OnboardingProvider>
  );
}
