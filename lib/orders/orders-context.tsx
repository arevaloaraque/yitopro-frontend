"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getPendingOrdersCount } from "@/lib/api/orders";
import { subscribeToEvents } from "@/lib/sse";
import type { SSEEvent } from "@/lib/types";

interface OrdersContextValue {
  /** Draft orders awaiting confirm/cancel — shown as the "Pedidos" nav badge. */
  pendingCount: number;
  /** Re-read the count from the backend (call after confirm/cancel). */
  refresh: () => void;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

/**
 * Single source of truth for the pending-draft-orders count, mounted once in the
 * authenticated layout. The sidebar badge and the Pedidos page consume it, so a
 * draft created by the sales agent (SSE) or a confirm/cancel from the panel
 * (explicit `refresh()`) both update the badge live. `pedido_cancelado` también
 * llega por SSE (events.ts) — sin ese case, una cancelación hecha en OTRA sesión
 * dejaba el badge contando de más hasta el próximo reload (auditoría 2026-08-20;
 * el comentario anterior afirmaba que cancelar no emitía evento, y era falso).
 */
export function OrdersProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(() => {
    getPendingOrdersCount()
      .then(setPendingCount)
      .catch((e) => console.error("Error al cargar el conteo de pedidos:", e));
  }, []);

  // Deferred load (keeps setState out of the effect's synchronous path).
  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  // Real-time: a new draft (`pedido_borrador_creado`), a confirmation
  // (`pedido_creado`) or a cancellation (`pedido_cancelado`) all move the
  // draft count — the three refresh the badge.
  useEffect(() => {
    const unsub = subscribeToEvents((event: SSEEvent) => {
      if (
        event.type === "pedido_creado" ||
        event.type === "pedido_borrador_creado" ||
        event.type === "pedido_cancelado"
      ) {
        refresh();
      }
    });
    return unsub;
  }, [refresh]);

  return (
    <OrdersContext.Provider value={{ pendingCount, refresh }}>
      {children}
    </OrdersContext.Provider>
  );
}

export function usePendingOrders(): OrdersContextValue {
  const ctx = useContext(OrdersContext);
  if (!ctx) {
    throw new Error("usePendingOrders must be used within an OrdersProvider");
  }
  return ctx;
}
