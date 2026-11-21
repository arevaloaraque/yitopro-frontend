"use client";

import { dayISO, dayLabel } from "@/lib/format/date";

interface ThreadDayProps {
  iso: string;
  /** Abre el selector de fecha con este día puesto. La píldora ES el control. */
  onPick: (day: string) => void;
}

/**
 * La píldora centrada que separa los días del hilo.
 *
 * Hay que construirla: `components/ui/separator.tsx` es una línea SIN texto y en
 * todo el panel no existía ningún divisor rotulado.
 *
 * Es un `<button>` a propósito: en un hilo largo la píldora es el ancla visible
 * del salto por fecha, así que abrirlo desde acá evita tener que ir a buscar el
 * control. Y por eso lleva un `title` que lo dice — un botón que parece etiqueta
 * no se descubre solo.
 */
export function ThreadDay({ iso, onPick }: ThreadDayProps) {
  const day = dayISO(new Date(iso));
  return (
    <div className="flex justify-center px-5 py-3">
      <button
        type="button"
        onClick={() => onPick(day)}
        title="Saltar a otra fecha"
        className="rounded-full bg-muted px-3 py-1 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {dayLabel(iso)}
      </button>
    </div>
  );
}
