"use client";

import { Package } from "lucide-react";

import { RankList } from "@/components/reports/rank-list";
import { ReportCard } from "@/components/reports/report-card";
import type { ValueSummary } from "@/lib/api/reports";
import { useGrowBars } from "@/lib/motion";

type ProductsData = NonNullable<ValueSummary["blocks"]["products"]>;

/**
 * Lo más vendido de la tienda, en UNIDADES.
 *
 * Unidades y no dinero por la misma razón que el contador de pedidos:
 * `products_order` no tiene columna de moneda y el precio de la línea es el que
 * estaba congelado en el borrador, así que sumar importes de meses distintos y
 * ponerles el símbolo de hoy imprimiría un total que nunca existió.
 *
 * Cuenta solo pedidos CONFIRMADOS —un borrador es una intención— y de cualquier
 * origen: el ranking describe la tienda, no a la IA. `null` en el backend = el
 * negocio nunca confirmó una línea, así que no tiene tienda que medir.
 */
export function ProductsBlock({
  products,
  animate,
}: {
  products: ProductsData;
  animate: boolean;
}) {
  const ref = useGrowBars<HTMLDivElement>(animate);
  const rows = products.top.map((row) => ({
    id: row.id,
    name: row.name,
    value: row.units,
    detail: `en ${row.orders} ${row.orders === 1 ? "pedido" : "pedidos"}`,
  }));

  return (
    <ReportCard
      title="Lo más vendido"
      subtitle="Unidades vendidas en pedidos confirmados, los cerrara quien los cerrara."
      icon={Package}
      link={{ href: "/products", label: "Ver productos" }}
    >
      <div ref={ref}>
        <RankList
          title="Productos por unidades vendidas"
          rows={rows}
          emptyLabel="No se confirmó ningún pedido en este período."
          barClass="bg-chart-3"
        />
      </div>
    </ReportCard>
  );
}
