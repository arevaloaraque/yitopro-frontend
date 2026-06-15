import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Icono de lucide-react. Por defecto: Inbox. */
  icon?: LucideIcon;
  /** Acción opcional (p.ej. un <Button>). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Estado vacío reutilizable. Toda pantalla con datos debe mostrarlo
 * cuando no hay resultados.
 */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-surface/60 px-8 py-20 text-center",
        className,
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/70 ring-1 ring-border/30">
        <Icon className="size-7 text-muted-foreground/60" aria-hidden="true" />
      </div>
      <h3 className="mt-6 text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-[0.8rem] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-7">{action}</div> : null}
    </div>
  );
}
