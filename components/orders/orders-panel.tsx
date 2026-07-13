"use client";

import { useCallback, useEffect, useState } from "react";
import { Receipt } from "lucide-react";

import {
  listOrders,
  confirmOrder,
  cancelOrder,
  type Order,
  type OrderStatus,
} from "@/lib/api";
import { usePendingOrders } from "@/lib/orders";
import { subscribeToEvents } from "@/lib/sse";
import type { SSEEvent } from "@/lib/types";
import { formatPrice } from "@/lib/utils";
import { Loading, EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const statusLabels: Record<OrderStatus, string> = {
  draft: "Borrador",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
};

const statusVariants: Record<OrderStatus, "warning" | "success" | "secondary"> = {
  draft: "warning",
  confirmed: "success",
  cancelled: "secondary",
};

function orderItemsLabel(items: Order["items"]): string {
  return items.map((i) => `${i.product_name} ×${i.quantity}`).join(", ");
}

/**
 * Orders list (created by the sales agent or the panel) with confirm/cancel.
 * Self-contained: owns its own data + real-time refresh, and updates the shared
 * pending-draft count after acting so the sidebar badge stays in sync (cancel
 * emits no SSE event, hence the explicit `refresh()`).
 */
export function OrdersPanel() {
  const { refresh: refreshPendingCount } = usePendingOrders();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await listOrders();
      setOrders(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar pedidos");
    } finally {
      setLoading(false);
    }
  }, []);

  // Deferred initial load (keeps setState out of the effect's synchronous path).
  useEffect(() => {
    const t = setTimeout(loadOrders, 0);
    return () => clearTimeout(t);
  }, [loadOrders]);

  // Real-time: a draft or a confirmed order refreshes the list (same multiplexed
  // stream the rest of the app uses; NotificationsProvider owns the toasts).
  useEffect(() => {
    const unsub = subscribeToEvents((event: SSEEvent) => {
      if (event.type === "pedido_creado" || event.type === "pedido_borrador_creado") {
        listOrders()
          .then(setOrders)
          .catch((err) => console.error("Error al refrescar pedidos vía SSE:", err));
      }
    });
    return unsub;
  }, []);

  async function handleConfirm(orderId: string) {
    setActionError(null);
    setActionLoadingId(orderId);
    try {
      await confirmOrder(orderId);
      await loadOrders();
      refreshPendingCount();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "No se pudo confirmar el pedido.",
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleCancel(orderId: string) {
    setActionError(null);
    setActionLoadingId(orderId);
    try {
      await cancelOrder(orderId);
      await loadOrders();
      refreshPendingCount();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No se pudo cancelar el pedido.");
    } finally {
      setActionLoadingId(null);
    }
  }

  if (loading) return <Loading rows={3} label="Cargando pedidos…" />;
  if (error) return <ErrorState description={error} onRetry={loadOrders} />;
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Sin pedidos"
        description="Los pedidos creados por el asistente o el panel aparecerán aquí."
      />
    );
  }

  return (
    <div className="space-y-4">
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      <div className="rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Ítems</TableHead>
              <TableHead className="w-32 text-right">Total</TableHead>
              <TableHead className="w-28">Estado</TableHead>
              <TableHead className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">{order.customer}</TableCell>
                <TableCell className="text-muted-foreground">
                  {orderItemsLabel(order.items)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPrice(order.total)}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariants[order.status]}>
                    {statusLabels[order.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {order.status === "draft" && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionLoadingId === order.id}
                        onClick={() => handleConfirm(order.id)}
                      >
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionLoadingId === order.id}
                        onClick={() => handleCancel(order.id)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
