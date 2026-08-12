"use client";

import { ShoppingBag } from "lucide-react";

import { ReportCard } from "@/components/reports/report-card";
import { useCountUp } from "@/lib/hooks/use-count-up";

/**
 * Bloque de pedidos: cuántos cerró la IA en la ventana. En UNIDADES y no en
 * dinero — el pedido no tiene columna de moneda, y formatearlo con la del
 * tenant imprimiría montos históricos con el símbolo de hoy. Misma regla de
 * render que el bloque de citas: `null` en el backend = nada en pantalla.
 */
export function OrdersBlock({
  aiConfirmedCount,
  animate,
}: {
  aiConfirmedCount: number;
  animate: boolean;
}) {
  const count = useCountUp(aiConfirmedCount, animate);
  return (
    <ReportCard
      title="Pedidos"
      subtitle="Pedidos que la IA creó y quedaron confirmados en el período."
      icon={ShoppingBag}
      link={{ href: "/orders", label: "Ver pedidos" }}
    >
      <p className="text-[1.75rem] leading-none font-semibold tracking-tight text-foreground tabular-nums">
        {count.toLocaleString("es-CL")}
      </p>
      <p className="mt-2 text-[0.8rem] leading-relaxed text-muted-foreground">
        {aiConfirmedCount === 1 ? "pedido confirmado" : "pedidos confirmados"}
      </p>
    </ReportCard>
  );
}
