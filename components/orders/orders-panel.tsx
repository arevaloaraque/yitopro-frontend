"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil, Plus, Printer, Receipt } from "lucide-react";
import { toast } from "sonner";

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
import { useMoney } from "@/lib/business";
import { formatDateTime, listDate } from "@/lib/format/date";
import { Loading, EmptyState, ErrorState } from "@/components/states";
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
import { OrderCancelDialog } from "./order-cancel-dialog";
import { OrderDetailDialog } from "./order-detail-dialog";
import { OrderPrintSheet } from "./order-print-sheet";
import { OrderOriginBadge, OrderStatusBadge, statusLabels } from "./order-meta";

type StatusFilter = OrderStatus | "all";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  ...(Object.entries(statusLabels) as [OrderStatus, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
];

const PAGE_SIZE = 20;

/** Which action is in flight, so only that button spins. */
type PendingAction = { id: string; kind: "confirm" | "cancel" } | null;

/**
 * Orders list (created by the sales agent or the panel) with a status filter,
 * "load more" pagination, manual create ("Nuevo pedido"), draft editing and a
 * read-only detail modal.
 *
 * Self-contained: owns its own data + real-time refresh, and updates the shared
 * pending-draft count after acting so the sidebar badge stays in sync.
 */
export function OrdersPanel() {
  const money = useMoney();
  const { refresh: refreshPendingCount } = usePendingOrders();

  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  // Bumped on every open so the editor remounts with a fresh form (see its `key`).
  const [editorSession, setEditorSession] = useState(0);
  // Detail and cancel-confirmation track an ID, not a copy of the order: patching a row
  // then has to update what they show, instead of leaving a stale snapshot on screen
  // (which is exactly what "confirm from inside the detail" would otherwise do).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  // La hoja de impresión guarda el pedido COMPLETO, no su id: se monta, se imprime y se
  // desmonta, así que no gana nada siguiendo a la lista, y así también funciona si el pedido
  // desaparece del filtro mientras el diálogo del navegador está abierto.
  const [printOrder, setPrintOrder] = useState<Order | null>(null);

  const detailOrder = useMemo(
    () => orders.find((o) => o.id === detailId) ?? null,
    [orders, detailId],
  );
  const cancelOrderTarget = useMemo(
    () => orders.find((o) => o.id === cancelId) ?? null,
    [orders, cancelId],
  );

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

  // Real-time refresh: any order transition refetches the list. Subscribe once; read
  // the current filter via a ref so the handler stays stable, and swallow errors so a
  // transient blip doesn't clobber the view.
  const statusRef = useRef(statusFilter);
  useEffect(() => {
    statusRef.current = statusFilter;
  });
  /**
   * Orders WE are changing right now, so the event our own PATCH triggers is ignored.
   *
   * Confirming publishes `pedido_creado` back to us (cancelling, `pedido_cancelado`).
   * Without this the handler below refetched with the active filter, the order no longer
   * matched `status=draft`, and the row we had just patched vanished — measured live: the
   * toast read "Pedido #33 confirmado · $34.000" while the row disappeared, the exact
   * failure `patchRow` exists to prevent.
   *
   * The id goes in when the action STARTS, not when its response lands: the backend
   * publishes post-commit, so the event routinely beats the HTTP response back to the
   * browser (measured — the refetch fired before our own `pending-count` call). Marking on
   * arrival was therefore always too late. Consume-once, so a LATER change by another
   * operator still refetches.
   */
  const selfAppliedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    return subscribeToEvents((event: SSEEvent) => {
      if (
        event.type === "pedido_creado" ||
        event.type === "pedido_cancelado" ||
        event.type === "pedido_borrador_creado" ||
        event.type === "pedido_borrador_actualizado"
      ) {
        // We already hold the server's own response for this order.
        if (selfAppliedRef.current.delete(String(event.data.order_id))) return;
        listOrders(statusRef.current === "all" ? undefined : statusRef.current)
          .then(setOrders)
          .catch((err) => console.error("Error al refrescar pedidos vía SSE:", err));
      }
    });
  }, []);

  /**
   * Replaces one row with the server's own answer instead of refetching.
   *
   * This is what keeps a just-confirmed row ON SCREEN while the "Borrador" filter is
   * active: a refetch would ask for `status=draft`, the order no longer qualifies, and
   * the row would silently vanish — a successful action looking exactly like a failure.
   */
  function patchRow(updated: Order) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  async function handleConfirm(order: Order) {
    setPendingAction({ id: order.id, kind: "confirm" });
    selfAppliedRef.current.add(order.id);
    try {
      const updated = await confirmOrder(order.id);
      patchRow(updated);
      toast.success(`Pedido #${updated.id} confirmado · ${money(updated.total)}`, {
        description: "Se descontó el stock de los productos.",
      });
      refreshPendingCount();
    } catch (e) {
      // Nothing was committed, so no event is coming: drop the mark or a later genuine
      // change to this order would be swallowed once.
      selfAppliedRef.current.delete(order.id);
      // The backend's 409 names the product and the units left — that belongs next to
      // the action, not in a banner at the top of the panel.
      toast.error(e instanceof Error ? e.message : "No se pudo confirmar el pedido.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCancel(order: Order) {
    const wasConfirmed = order.status === "confirmed";
    setPendingAction({ id: order.id, kind: "cancel" });
    selfAppliedRef.current.add(order.id);
    try {
      const updated = await cancelOrder(order.id);
      patchRow(updated);
      setCancelId(null);
      toast.success(`Pedido #${updated.id} cancelado`, {
        description: wasConfirmed
          ? "Se repuso el stock de los productos."
          : "El borrador ya no está pendiente.",
      });
      refreshPendingCount();
    } catch (e) {
      selfAppliedRef.current.delete(order.id);
      toast.error(e instanceof Error ? e.message : "No se pudo cancelar el pedido.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSaved() {
    await loadOrders();
    refreshPendingCount();
  }

  function pendingKind(orderId: string): "confirm" | "cancel" | null {
    return pendingAction?.id === orderId ? pendingAction.kind : null;
  }

  if (loading) return <Loading rows={3} label="Cargando pedidos…" />;
  if (error) return <ErrorState description={error} onRetry={loadOrders} />;

  const visibleOrders = orders.slice(0, visible);

  return (
    <div className="space-y-4">
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
                  <TableHead className="w-20">N.º</TableHead>
                  {/* Los ítems NO van en la lista: son el contenido del pedido, y el
                      contenido se lee en el detalle. Acá la fila solo tiene que
                      identificar el pedido y decir en qué estado está. */}
                  <TableHead>Cliente</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                  <TableHead className="w-28">Estado</TableHead>
                  <TableHead className="hidden w-28 md:table-cell">Origen</TableHead>
                  <TableHead className="hidden w-24 md:table-cell">Fecha</TableHead>
                  <TableHead className="w-60">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleOrders.map((order) => (
                  // No `role="button"` on the row: it holds real buttons, and a button
                  // inside a button is a nested control that screen readers mangle. The
                  // number cell carries the keyboard-reachable control; the row click is
                  // mouse convenience on top of it.
                  <TableRow
                    key={order.id}
                    className="cursor-pointer"
                    onClick={() => setDetailId(order.id)}
                  >
                    <TableCell>
                      <button
                        type="button"
                        aria-label={`Ver detalle del pedido ${order.id}`}
                        className="rounded font-medium text-muted-foreground tabular-nums underline-offset-3 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailId(order.id);
                        }}
                      >
                        #{order.id}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium">{order.customer}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(order.total)}
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <OrderOriginBadge createdByAi={order.created_by_ai} />
                    </TableCell>
                    <TableCell
                      className="hidden text-muted-foreground md:table-cell"
                      // The cell shows "hace 3h"; the tooltip has to be the readable
                      // date, not the raw ISO string.
                      title={formatDateTime(order.created_at)}
                    >
                      {listDate(order.created_at)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {/* Imprimir va PRIMERO y existe en TODAS las filas: es la única acción
                          que aplica a cualquier estado, así que puesta al principio cae en la
                          misma x en toda la columna. Antes esta celda quedaba vacía en los
                          confirmados y cancelados. */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Imprimir pedido ${order.id}`}
                          onClick={() => setPrintOrder(order)}
                        >
                          <Printer className="size-3.5" />
                        </Button>
                        {order.status === "draft" && (
                          <>
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
                              disabled={pendingAction?.id === order.id}
                              onClick={() => handleConfirm(order)}
                            >
                              {pendingKind(order.id) === "confirm" && (
                                <Loader2 className="size-3.5 animate-spin" />
                              )}
                              Confirmar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={pendingAction?.id === order.id}
                              onClick={() => setCancelId(order.id)}
                            >
                              Cancelar
                            </Button>
                          </>
                        )}
                      </div>
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

      <OrderDetailDialog
        order={detailOrder}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        // Close the detail before opening the editor: now that the detail is itself a
        // modal, keeping it open would stack two dialogs, and the editor already shows
        // everything the detail does for a draft.
        onEdit={(order) => {
          setDetailId(null);
          openEditor(order);
        }}
        onConfirm={handleConfirm}
        onCancel={(order) => setCancelId(order.id)}
        pending={detailOrder ? pendingKind(detailOrder.id) : null}
      />

      <OrderCancelDialog
        order={cancelOrderTarget}
        onOpenChange={(open) => {
          if (!open) setCancelId(null);
        }}
        onConfirm={handleCancel}
        pending={pendingAction?.kind === "cancel"}
      />

      <OrderEditorDialog
        key={editorSession}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        order={editingOrder}
        onSaved={handleSaved}
      />

      <OrderPrintSheet order={printOrder} onDone={() => setPrintOrder(null)} />
    </div>
  );
}
