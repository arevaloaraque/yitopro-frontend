"use client";

import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * La barra de filtros de una tabla. Misma caja, mismo icono, mismo sitio y el
 * mismo «Limpiar» en las siete pantallas.
 *
 * Hasta ahora `SlidersHorizontal` aparecía en UN solo archivo (`/payments`): era
 * la firma visual de «esta pantalla filtra», y las otras seis colgaban sus
 * controles sueltos en cuatro sitios distintos de la página. Un operador que
 * aprende a filtrar pagos no aprendía nada sobre filtrar pedidos.
 *
 * `flex-wrap` y no una grilla rígida: los disparadores son `w-fit`, así que una
 * grilla de 4 columnas dejaba huecos muertos entre controles compactos y
 * aplastaba las etiquetas largas hasta los puntos suspensivos.
 */
export function FilterBar({
  active,
  onClear,
  children,
}: {
  /** Hay algún filtro puesto: condiciona el botón «Limpiar». */
  active: boolean;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        Filtros
        {active && (
          <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={onClear}>
            Limpiar
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}
