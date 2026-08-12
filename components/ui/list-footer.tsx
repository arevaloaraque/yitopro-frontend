"use client";

import { Button } from "@/components/ui/button";

/**
 * El pie de una tabla paginada. Un solo componente para las dos formas de
 * paginar que tiene el backend, y ese es justamente el punto:
 *
 * - **Con `total`** (`limit/offset` + `count`: clientes, productos, servicios,
 *   pedidos) → «Mostrando 20 de 137».
 * - **Sin `total`** (cursor: pagos) → «25 registros (hay más)». La regla de no
 *   pedir un `COUNT` sobre un recorte filtrado de la historia del tenant deja
 *   de ser una convención escrita en un comentario y pasa a ser una diferencia
 *   de tipos: el endpoint que no puede contar barato simplemente no pasa
 *   `total`.
 *
 * `aria-live="polite"` en el conteo: al pulsar «Cargar más» el foco se queda en
 * el botón y lo único que cambia son filas más arriba. Sin esto, un lector de
 * pantalla no tiene forma de saber que la lista creció.
 */
export function ListFooter({
  shown,
  total,
  hasMore,
  loading,
  onLoadMore,
  noun = "registro",
  nounPlural = "registros",
}: {
  /** Filas en pantalla. */
  shown: number;
  /** Total del servidor. Omitir si el endpoint no puede contar barato. */
  total?: number;
  /** Solo se lee cuando NO hay `total`. */
  hasMore?: boolean;
  loading: boolean;
  onLoadMore: () => void;
  noun?: string;
  nounPlural?: string;
}) {
  if (shown === 0) return null;

  const more = total !== undefined ? shown < total : Boolean(hasMore);

  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span aria-live="polite">
        {total !== undefined
          ? `Mostrando ${shown} de ${total}`
          : `${shown} ${shown === 1 ? noun : nounPlural}${more ? " (hay más)" : ""}`}
      </span>
      {more && (
        <Button variant="outline" size="sm" disabled={loading} onClick={onLoadMore}>
          {loading ? "Cargando…" : "Cargar más"}
        </Button>
      )}
    </div>
  );
}
