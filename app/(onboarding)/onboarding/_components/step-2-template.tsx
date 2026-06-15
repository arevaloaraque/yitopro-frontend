"use client";

import { Check } from "lucide-react";

import { useOnboarding } from "@/lib/onboarding";
import { INDUSTRY_TEMPLATES } from "@/lib/onboarding/templates";
import { cn } from "@/lib/utils";

export function Step2Template() {
  const { data, selectTemplate } = useOnboarding();

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {INDUSTRY_TEMPLATES.map((tpl) => {
        const isSelected = data.selectedTemplate?.id === tpl.id;
        return (
          <button
            key={tpl.id}
            type="button"
            onClick={() => selectTemplate(tpl.id)}
            className={cn(
              "relative flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all duration-200",
              isSelected
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border hover:border-border/80 hover:bg-surface",
            )}
          >
            {isSelected && (
              <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" />
              </span>
            )}
            <span className="text-2xl">{tpl.icon}</span>
            <div>
              <p className="text-[0.8rem] font-semibold text-foreground">
                {tpl.label}
              </p>
              <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
                {tpl.description}
              </p>
            </div>
            <div className="mt-auto flex flex-wrap gap-1">
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">
                {tpl.services.length} servicios
              </span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">
                {tpl.agents.length} agentes
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
