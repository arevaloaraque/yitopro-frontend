"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Receipt } from "lucide-react";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderEditorDialog } from "./order-editor-dialog";

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

type StatusFilter = OrderStatus | "all";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  ...(Object.entries(statusLabels) as [OrderStatus, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
];

const PAGE_SIZE = 20;

function orderItemsLabel(items: Order["items"]): string {
  return items
    .map((i) => `${i.product_name} ×${i.quantity} (${formatPrice(i.unit_price)})`)
    .join(", ");
}

/**
 * Orders list (created by the sales agent or the panel) with a status filter,
 * "load more" pagination, manual create ("Nuevo pedido") and draft editing.
 * Self-contained: owns its own data + real-time refresh, and updates the shared
 * pending-draft count after acting so the sidebar badge stays in sync (cancel
 * emits no SSE event, hence the explicit `refresh()`).
 */
export function OrdersPanel() {
  const { refresh: refreshPendingCount } = usePendingOrders();

  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  // Bumped on every open so the editor remounts with a fresh form (see its `key`).
  const [editorSession, setEditorSession] = useState(0);

  function openEditor(order: Order | null) {
    setEditingOrder(order);
    setEditorSession((s) => s + 1);
    setEditorOpen(true);
  }

  const loadOrders = useCallback(async () => {
    try {
      const data = await listOrders(statusFilter === "all" ? undefined : statusFilter);
      setOrders(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar pedidos");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // Deferred load; re-runs when the status filter changes (keeps setState out of
  // the effect's synchronous path).
  useEffect(() => {
    const t = setTimeout(loadOrders, 0);
    return () => clearTimeout(t);
  }, [loadOrders]);

  // Real-time refresh: a draft created/updated or a confirmed order refetches
  // the list. Subscribe once; read the current filter via a ref so the handler
  // stays stable, and swallow errors so a transient blip doesn't clobber the view.
  const statusRef = useRef(statusFilter);
  useEffect(() => {
    statusRef.current = statusFilter;
  });
  useEffect(() => {
    return subscribeToEvents((event: SSEEvent) => {
      if (
        event.type === "pedido_creado" ||
        event.type === "pedido_borrador_creado" ||
        event.type === "pedido_borrador_actualizado"
      ) {
        listOrders(statusRef.current === "all" ? undefined : statusRef.current)
          .then(setOrders)
          .catch((err) => console.error("Error al refrescar pedidos vía SSE:", err));
      }
    });
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

  async function handleSaved() {
    await loadOrders();
    refreshPendingCount();
  }

  if (loading) return <Loading rows={3} label="Cargando pedidos…" />;
  if (error) return <ErrorState description={error} onRetry={loadOrders} />;

  const visibleOrders = orders.slice(0, visible);

  return (
    <div className="space-y-4">
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <div className="flex items-center justify-between gap-2">
        <div className="w-48">
          <Select
            items={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter((v ?? "all") as StatusFilter);
              setVisible(PAGE_SIZE);
            }}
          >
            <SelectTrigger className="w-full" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => openEditor(null)}>
          <Plus className="size-4" />
          Nuevo pedido
        </Button>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Sin pedidos"
          description={
            statusFilter === "all"
              ? "Los pedidos creados por el asistente o el panel aparecerán aquí."
              : "No hay pedidos con este estado."
          }
        />
      ) : (
        <>
          <div className="rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ítems</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                  <TableHead className="w-28">Estado</TableHead>
                  <TableHead className="w-52" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.customer}</TableCell>
                    <TableCell
                      className="max-w-[24rem] truncate text-muted-foreground"
                      title={orderItemsLabel(order.items)}
                    >
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
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Editar pedido"
                            onClick={() => openEditor(order)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
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

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Mostrando {visibleOrders.length} de {orders.length}
            </span>
            {visible < orders.length && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
              >
                Cargar más
              </Button>
            )}
          </div>
        </>
      )}

      <OrderEditorDialog
        key={editorSession}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        order={editingOrder}
        onSaved={handleSaved}
      />
    </div>
  );
}
