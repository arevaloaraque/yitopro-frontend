"use client";

import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de indicador de `/reports`.
 *
 * Propia y no `MetricCard`: esa la comparte `/dashboard`, y este rediseño solo
 * puede tocar reportes. Aquí la caja es más compacta (el reporte muestra cinco
 * seguidas) y gana un pie con enlace a la pantalla que profundiza el dato.
 *
 * NO tiene chip de variación, y es a propósito: el backend solo devuelve una
 * base comparable para cobros. Un «+31% vs la semana pasada» en cada tarjeta,
 * como el que luce cualquier plantilla, aquí sería inventado.
 */
export interface KpiCardProps {
  label: string;
  /** Ya formateado: esta tarjeta no decide separadores ni unidades. */
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "accent" | "warning";
  /** Solo si esa pantalla profundiza DE VERDAD este número. */
  link?: { href: string; label: string };
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  link,
}: KpiCardProps) {
  return (
    <Card
      data-reveal
      className="flex h-full flex-col gap-0 rounded-2xl p-4 transition-shadow duration-200 hover:shadow-md sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.75rem] leading-snug text-muted-foreground">{label}</p>
        <span className="relative flex shrink-0 items-center justify-center">
          {/* Halo DECORATIVO: late aquí, no en la tarjeta. Animar en bucle una
              caja clicable deja un blanco móvil. */}
          <span
            data-card-glow
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-xl bg-primary/15"
          />
          <span
            data-card-icon
            className={cn(
              "relative flex size-9 items-center justify-center rounded-xl",
              tone === "accent" && "bg-accent/10 text-accent ring-1 ring-accent/20",
              tone === "warning" && "bg-warning/10 text-warning ring-1 ring-warning/20",
              tone === "default" && "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </span>
      </div>

      <p className="mt-3 text-[1.75rem] leading-none font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>

      {hint ? (
        <p className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {link ? (
        // `mt-auto` clava el enlace abajo: las cinco tarjetas de la fila se
        // estiran a la misma altura y sin esto cada enlace cae donde lo dejó
        // el largo de su propio texto.
        <Link
          href={link.href}
          className="mt-auto inline-flex items-center gap-1 pt-3 text-[0.7rem] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {link.label}
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </Link>
      ) : null}
    </Card>
  );
}
