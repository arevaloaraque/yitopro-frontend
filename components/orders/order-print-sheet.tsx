"use client";

import { useEffect } from "react";

import type { Order } from "@/lib/api";
import { useMoney } from "@/lib/business";
// Desde el módulo, no del barrel: `lib/business/index.ts` solo reexporta `useBusiness`, que
// lanza sin provider. Acá hace falta la variante opcional — la cabecera degrada a un guión
// si no hay negocio en contexto (es lo mismo que hace `use-money`).
import { useBusinessOptional } from "@/lib/business/business-context";
import { formatDateTime } from "@/lib/format/date";
import { formatNumber } from "@/lib/utils";

import { orderDisplayName } from "./order-detail-content";
import { statusLabels } from "./order-meta";

/** El id del contenedor; `app/globals.css` lo usa para aislar la impresión. */
export const PRINT_ROOT_ID = "order-print-root";

interface OrderPrintSheetProps {
  /** No-null dispara la impresión. */
  order: Order | null;
  /** Se llama cuando el diálogo del navegador se cerró (imprimió o canceló). */
  onDone: () => void;
}

/** Una fila etiqueta/valor del encabezado, en dos columnas fijas. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 uppercase">{label}</span>
      <span className="min-w-0 flex-1">{value}</span>
    </div>
  );
}

function Rule() {
  return <div className="my-2 border-t border-black" />;
}

/**
 * El comprobante del pedido: un documento de TEXTO PLANO, sin la estética del panel.
 *
 * Se imprime la página actual aislando este contenedor (`@media print` en globals.css) en vez
 * de abrir una ventana nueva: una ventana nueva no hereda las hojas de estilo —habría que
 * reinyectarlas— y encima la bloquean los popup blockers. Para obtener un PDF se elige
 * «Guardar como PDF» en el diálogo del navegador, que es el generador de PDF que ya trae la
 * plataforma; una librería de PDF en el bundle solo para esto no se paga.
 *
 * Monoespaciado y en negro a propósito: es un comprobante, no una pantalla. Nada de
 * distintivos de color, iconos ni bordes redondeados — el estado va como palabra.
 */
export function OrderPrintSheet({ order, onDone }: OrderPrintSheetProps) {
  const money = useMoney();
  const business = useBusinessOptional()?.business ?? null;

  useEffect(() => {
    if (!order) return;
    // `afterprint` cubre tanto imprimir como cancelar; sin él la hoja quedaría montada y el
    // siguiente click en la misma fila no volvería a disparar el efecto.
    const done = () => onDone();
    window.addEventListener("afterprint", done);
    // Dos frames: el primero deja a React pintar el contenido, el segundo garantiza que el
    // layout ya esté resuelto antes de que el navegador congele la página para imprimir.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => window.print()),
    );
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("afterprint", done);
    };
  }, [order, onDone]);

  if (!order) return null;

  return (
    <div
      id={PRINT_ROOT_ID}
      // `hidden print:block`: el display lo maneja Tailwind con su propia variante `print:`,
      // que gana dentro de la media query por orden de emisión.
      className="hidden font-mono text-[11px] leading-relaxed text-black print:block"
      aria-hidden
    >
      {/* 1. Cabecera del negocio. Dirección y WhatsApp pueden venir vacíos (el onboarding no
             los exige), y una línea en blanco en un comprobante se lee como un dato perdido:
             si no están, no se imprime la fila. */}
      <header>
        <p className="text-sm font-bold uppercase">{business?.name ?? "—"}</p>
        {business?.address ? <p>{business.address}</p> : null}
        {business?.whatsapp_number ? (
          <p>{formatNumber(business.whatsapp_number)}</p>
        ) : null}
      </header>

      <Rule />

      {/* 2. Datos del cliente. */}
      <section>
        <Row label="Cliente" value={orderDisplayName(order)} />
        <Row label="Teléfono" value={formatNumber(order.customer_phone)} />
        {order.customer_email ? (
          <Row label="Email" value={order.customer_email} />
        ) : null}
      </section>

      <Rule />

      {/* 3 y 4. Número de pedido y estado. */}
      <section>
        <Row label="Pedido" value={`N.º ${order.id}`} />
        <Row label="Fecha" value={formatDateTime(order.created_at)} />
        <Row label="Estado" value={statusLabels[order.status]} />
      </section>

      <Rule />

      {/* 5. Ítems. Una tabla de verdad y no texto rellenado con espacios: un nombre de
             producto largo envuelve, y con padding manual las columnas se desalinearían en
             cuanto eso pasara. */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1 text-left font-bold uppercase">Producto</th>
            <th className="w-14 py-1 text-right font-bold uppercase">Cant.</th>
            <th className="w-24 py-1 text-right font-bold uppercase">P. unit.</th>
            <th className="w-24 py-1 text-right font-bold uppercase">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((line) => (
            <tr key={line.product_id} className="align-top">
              <td className="py-0.5 pr-2">{line.product_name}</td>
              <td className="py-0.5 text-right tabular-nums">{line.quantity}</td>
              <td className="py-0.5 text-right tabular-nums">{money(line.unit_price)}</td>
              <td className="py-0.5 text-right tabular-nums">{money(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Rule />

      {/* 6. Total, alineado a la derecha. */}
      <div className="flex justify-end gap-4 text-sm font-bold">
        <span className="uppercase">Total</span>
        <span className="w-24 text-right tabular-nums">{money(order.total)}</span>
      </div>
    </div>
  );
}
