"use client";

import type { MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * El control por el que se abre una fila desde el teclado.
 *
 * La alternativa —`<tr role="button" tabIndex={0} onKeyDown>`— está descartada
 * en este repo por tres motivos, y los tres se pagaron ya en producción:
 *
 * 1. **Anida controles.** Una fila con botones dentro que a su vez es un botón
 *    es un control anidado; un lector de pantalla lo lee mal.
 * 2. **`role="button"` poda la fila.** El rol implica *Children Presentational*:
 *    con un `aria-label` propio, el lector anuncia «Ver detalle del pago de Ana
 *    Pérez, botón» y ni monto, ni estado, ni fecha. La tabla deja de ser tabla.
 * 3. **Rompe el teclado de lo que lleva dentro.** Si la fila escucha `keyDown` y
 *    hace `preventDefault()`, mata el click nativo que Enter dispara sobre los
 *    botones de la fila: se tabula hasta «Ver historial», se pulsa Enter y se
 *    abre el detalle. Detener el `onClick` de la celda no basta — el evento de
 *    teclado viaja por su cuenta.
 *
 * El anillo de foco va aquí y no en el `<tr>`: Tailwind compila `ring` a
 * `box-shadow`, y con `border-collapse: collapse` (que impone el preflight) un
 * `box-shadow` sobre `<tr>` no se pinta en WebKit ni en Blink.
 *
 * El click de la fila puede seguir existiendo como comodidad de ratón; este
 * botón detiene el suyo para no abrir dos veces.
 */
export function RowOpenButton({
  label,
  onOpen,
  className,
  children,
}: {
  /** Qué abre, dicho entero: «Ver detalle del pedido 32». */
  label: string;
  onOpen: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "rounded text-left underline-offset-3 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {children}
    </button>
  );
}
