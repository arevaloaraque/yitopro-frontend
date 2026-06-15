"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OnboardingStep } from "@/lib/onboarding";
import { STEP_LABELS, TOTAL_STEPS } from "@/lib/onboarding";

interface StepperProps {
  currentStep: OnboardingStep;
  completedSteps: Set<OnboardingStep>;
  onStepClick: (step: OnboardingStep) => void;
}

function StepIcon({
  step,
  isCompleted,
}: {
  step: OnboardingStep;
  isCompleted: boolean;
}) {
  if (isCompleted) {
    return <Check className="size-3.5" />;
  }
  return <span className="text-xs font-semibold tabular-nums">{step}</span>;
}

export function Stepper({
  currentStep,
  completedSteps,
  onStepClick,
}: StepperProps) {
  return (
    <nav aria-label="Progreso del onboarding" className="mb-10">
      <ol className="flex items-center gap-0">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => {
          const step = (i + 1) as OnboardingStep;
          const isCompleted = completedSteps.has(step);
          const isCurrent = step === currentStep;
          const isClickable = isCompleted || step < currentStep;

          return (
            <li key={step} className="flex flex-1 items-center">
              {/* Connector line (before) */}
              {step > 1 && (
                <div
                  className={cn(
                    "h-px flex-1 transition-colors duration-200",
                    isCompleted || step <= currentStep
                      ? "bg-primary"
                      : "bg-border",
                  )}
                />
              )}

              {/* Step circle + label */}
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(step)}
                className={cn(
                  "flex flex-col items-center gap-1.5 transition-all duration-200",
                  isClickable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border-2 text-sm transition-all duration-200",
                    isCompleted &&
                      "border-primary bg-primary text-primary-foreground",
                    isCurrent && !isCompleted && "border-primary text-primary",
                    !isCompleted &&
                      !isCurrent &&
                      "border-border text-muted-foreground",
                  )}
                >
                  <StepIcon
                    step={step}
                    isCompleted={isCompleted}
                  />
                </span>
                <span
                  className={cn(
                    "text-[0.65rem] font-medium leading-tight transition-colors duration-200",
                    isCurrent
                      ? "text-foreground"
                      : isCompleted
                        ? "text-muted-foreground"
                        : "text-muted-foreground/50",
                  )}
                >
                  {STEP_LABELS[step]}
                </span>
              </button>

              {/* Connector line (after, for last item) */}
              {step === TOTAL_STEPS && (
                <div
                  className={cn(
                    "h-px flex-1 transition-colors duration-200",
                    isCompleted ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
