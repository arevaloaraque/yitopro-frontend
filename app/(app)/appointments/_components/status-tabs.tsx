"use client";

import type { AppointmentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type StatusFilter = AppointmentStatus | "all";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "scheduled", label: "Agendadas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "completed", label: "Completadas" },
  { value: "no_show", label: "No asistió" },
];

/** Label in Spanish for a status filter (falls back to the raw value). */
export function statusLabel(status: StatusFilter): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

/**
 * ¿Es un estado que esta pantalla conoce? Desde que el filtro vive en la URL,
 * su valor es entrada del usuario: un `?status=lol` pegado a mano viajaría al
 * backend como filtro y el 422 se leería como «la agenda no carga».
 */
export function isStatusFilter(value: string): value is StatusFilter {
  return STATUS_OPTIONS.some((o) => o.value === value);
}

interface StatusTabsProps {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
  /** id del rótulo visible que la barra de filtros pone encima. */
  labelledBy?: string;
}

export function StatusTabs({ value, onChange, labelledBy }: StatusTabsProps) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : "Filtrar por estado"}
      className="flex max-w-full [scrollbar-width:none] items-center gap-1 overflow-x-auto rounded-lg bg-muted p-0.5 [&::-webkit-scrollbar]:hidden"
    >
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          // CITAS-08: cuál está puesto se decía SOLO con el fondo claro, que un
          // lector de pantalla no ve y un daltónico apenas distingue.
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
            value === opt.value
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
