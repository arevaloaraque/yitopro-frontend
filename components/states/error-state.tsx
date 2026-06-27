"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Si se provee, muestra un botón "Reintentar". */
  onRetry?: () => void;
  /** Acción adicional (p.ej. un enlace "Ir al inicio") debajo del botón. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Estado de error reutilizable. Toda pantalla con datos debe mostrarlo
 * cuando la carga falla, ofreciendo reintentar.
 */
export function ErrorState({
  title = "Algo salió mal",
  description = "No pudimos cargar la información. Inténtalo de nuevo.",
  onRetry,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-border/40 bg-surface/60 px-8 py-20 text-center",
        className,
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 ring-1 ring-destructive/20">
        <AlertTriangle className="size-7 text-destructive" aria-hidden="true" />
      </div>
      <h3 className="mt-6 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-[0.8rem] leading-relaxed text-muted-foreground">
        {description}
      </p>
      {onRetry || action ? (
        <div className="mt-7 flex items-center gap-3">
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Reintentar
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
