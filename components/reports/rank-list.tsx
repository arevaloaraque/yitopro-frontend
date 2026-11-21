"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Cuántas filas se ven antes de pedir el resto.
 *
 * Tres y no cinco por una razón de layout, no de contenido: la agenda apila DOS
 * de estas listas y es la tarjeta que fija la altura común de las seis del
 * detalle. Con cinco filas cada una medía 819 px y las demás —una de ellas de
 * 196— quedaban con más de 600 px de aire. El resto de las filas no se pierde:
 * está a un clic, y el tope real del contrato se nombra debajo.
 */
export const COLLAPSED_ROWS = 3;

export interface RankRow {
  id: number;
  name: string;
  /** El número que ordena y se muestra a la derecha. */
  value: number;
  /** Segunda línea opcional bajo el nombre (p. ej. «en 3 pedidos»). */
  detail?: string;
}

/**
 * Lista rankeada: nombre, barra proporcional a lo ancho y el conteo a la derecha.
 *
 * Compartida por la agenda (profesionales y servicios) y por la tienda: eran la
 * misma lista escrita dos veces.
 *
 * **Colapsa a las primeras {@link COLLAPSED_ROWS} filas y ofrece el resto.**
 * Antes el backend cortaba en cinco y no había forma de llegar a la sexta: un
 * negocio con quince profesionales veía un tercio de su agenda y ninguna pista
 * de que faltaba algo. Ahora el contrato manda hasta 20 y el tope se dice en
 * pantalla, porque una lista recortada que no lo declara se lee como completa.
 *
 * La barra ocupa el ancho DISPONIBLE, no 96 px fijos: siendo la única
 * codificación visual de magnitud, con ancho fijo la diferencia entre 41 y 33
 * quedaba en unos pocos píxeles mientras sobraba media tarjeta.
 *
 * Sin superlativos («tu profesional estrella»): con una sola cita, coronar a
 * alguien dice mucho más de lo que el dato aguanta. El conteo va siempre en
 * texto — la barra acompaña al número, nunca lo reemplaza.
 */
export function RankList({
  title,
  rows,
  emptyLabel,
  barClass = "bg-primary",
}: {
  title: string;
  rows: RankRow[];
  emptyLabel: string;
  barClass?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const top = rows[0]?.value ?? 0;
  const hidden = Math.max(0, rows.length - COLLAPSED_ROWS);
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <div>
      <h3 className="text-[0.75rem] font-medium text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1.5 text-[0.8rem] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <>
          <ul className="mt-3 space-y-3">
            {shown.map((row) => (
              <li key={row.id}>
                <div className="flex items-baseline justify-between gap-3 text-[0.8rem]">
                  <span className="min-w-0 truncate text-foreground" title={row.name}>
                    {row.name}
                  </span>
                  <span className="shrink-0 font-medium text-foreground tabular-nums">
                    {row.value.toLocaleString("es-CL")}
                  </span>
                </div>
                {row.detail ? (
                  <p className="text-[0.7rem] text-muted-foreground">{row.detail}</p>
                ) : null}
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    data-bar
                    className={cn("h-full origin-left rounded-full", barClass)}
                    style={{ width: `${top > 0 ? (row.value / top) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-3 inline-flex items-center gap-1 text-[0.7rem] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {expanded ? "Ver menos" : `Ver ${hidden} más`}
              <ChevronDown
                className={cn("size-3 transition-transform", expanded && "rotate-180")}
                aria-hidden="true"
              />
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
