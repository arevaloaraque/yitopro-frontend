"use client";

import { OrdersPanel } from "@/components/orders/orders-panel";

export default function OrdersPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Pedidos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pedidos creados por el asistente o el panel. Confirma o cancela los borradores
          pendientes.
        </p>
      </div>
      <OrdersPanel />
    </div>
  );
}
