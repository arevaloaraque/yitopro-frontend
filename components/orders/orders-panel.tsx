"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { Loading, EmptyState, ErrorState } from "@/components/states";
import { FilterBar } from "@/components/filters/filter-bar";
import {
  CustomerCombobox,
  type CustomerSelection,
} from "@/components/customers/customer-combobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ListFooter } from "@/components/ui/list-footer";
import { RowOpenButton } from "@/components/ui/row-open-button";
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

/**
 * Filtros de la pantalla, con sus valores por defecto.
 *
 * Constante de módulo y no un literal en el render: `useUrlFilters` congela los
 * defaults en el primer render para decidir qué claves omitir de la URL.
 */
const FILTER_DEFAULTS = { status: "all", customer: "" };

/** Which action is in flight, so only that button spins. */
type PendingAction = { id: string; kind: "confirm" | "cancel" } | null;

/**
 * Orders list (created by the sales agent or the panel) with a status filter,
 * "load more" pagination, manual create ("Nuevo pedido"), draft editing and a
 * read-only detail modal.
 *
 * Self-contained: owns its own data + real-time refresh, and updates the shared
 * pending-draft count after acting so the sidebar badge stays in sync.
 *
 * El `<Suspense>` no es decorativo: los filtros viven en la URL vía
 * `useUrlFilters`, que lee `useSearchParams`, y el App Router exige un límite de
 * Suspense alrededor de quien lo llame o la ruta entera cae a render de cliente
 * en el build.
 */
export function OrdersPanel() {
  return (
    <Suspense fallback={<Loading rows={3} label="Cargando pedidos…" />}>
      <OrdersPanelInner />
    </Suspense>
  );
}

function OrdersPanelInner() {
  const money = useMoney();
  const { refresh: refreshPendingCount } = usePendingOrders();

  // Los filtros viven en la URL: una vista filtrada se comparte por chat y
  // sobrevive un reload. `useUrlFilters` preserva las claves que no gestiona, así
  // que un `?id=` de otro sitio no se borra al filtrar.
  const [filters, setFilters] = useUrlFilters(FILTER_DEFAULTS);
  const statusFilter = filters.status as StatusFilter;
  // El combobox necesita el NOMBRE, la URL solo lleva el id. Se hidrata de las
  // propias filas tras cargar (ver `loadOrders`), no con una request extra.
  const [customerSel, setCustomerSel] = useState<CustomerSelection>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  // El total real del servidor. Antes el pie imprimía `orders.length` contra el
  // tope de red de 500 y llamaba «total» a un número inventado por el cliente.
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
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

  const hasFilters = filters.status !== "all" || filters.customer !== "";

  function openEditor(order: Order | null) {
    setEditingOrder(order);
    setEditorSession((s) => s + 1);
    setEditorOpen(true);
  }

  const loadOrders = useCallback(
    async (opts: {
      status: StatusFilter;
      customerId: string;
      offset: number;
      append: boolean;
      /** Solo para refrescos: cuántas filas traer de vuelta. Default: una página. */
      limit?: number;
    }) => {
      setListLoading(true);
      try {
        const res = await listOrders(opts.status === "all" ? undefined : opts.status, {
          // La cadena vacía la descarta `lib/api/client.ts`; no hay que
          // volver a filtrarla acá.
          customer_id: opts.customerId,
          limit: opts.limit ?? PAGE_SIZE,
          offset: opts.offset,
        });
        setOrders((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setCount(res.count);
        // Un enlace compartido llega con el id del cliente y nada más. Sin esto el
        // combobox aparece vacío sobre una lista ya filtrada, que se lee como «no
        // hay ningún filtro puesto». El nombre sale de las propias filas, así que
        // no cuesta una request extra; `prev ??` para no pisar lo que el operador
        // acaba de elegir.
        const row = res.items[0];
        if (opts.customerId && !opts.append && row) {
          setCustomerSel(
            (prev) =>
              prev ?? {
                id: row.customer_id,
                name: row.customer,
                phone: row.customer_phone,
              },
          );
        }
        setError(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Error al cargar pedidos";
        // Un fallo al traer la página 2 no puede borrar lo que ya está en pantalla:
        // sería una lista completa reemplazada por un cartel de error. El de la
        // primera carga sí toma la pantalla (no hay nada que perder).
        if (opts.append) toast.error(message);
        else setError(message);
      } finally {
        setLoading(false);
        setListLoading(false);
      }
    },
    [],
  );

  // Deferred load; re-runs when a filter changes (keeps setState out of the
  // effect's synchronous path).
  useEffect(() => {
    const t = setTimeout(
      () =>
        loadOrders({
          status: filters.status as StatusFilter,
          customerId: filters.customer,
          offset: 0,
          append: false,
        }),
      0,
    );
    return () => clearTimeout(t);
  }, [filters.status, filters.customer, loadOrders]);

  // Real-time refresh: any order transition refetches the list. Subscribe once; read
  // the current filters and how much está en pantalla via refs so the handler stays
  // stable.
  const filtersRef = useRef(filters);
  const shownRef = useRef(0);
  useEffect(() => {
    filtersRef.current = filters;
    shownRef.current = orders.length;
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
        loadOrders({
          status: filtersRef.current.status as StatusFilter,
          customerId: filtersRef.current.customer,
          offset: 0,
          append: false,
          // Acotado a lo que hay EN PANTALLA: antes cada transición de cualquier
          // pedido del negocio se bajaba 500 filas, y la IA genera borradores por
          // WhatsApp sin que nadie toque el panel. Pedir solo PAGE_SIZE tampoco
          // sirve: colapsaría la lista a 20 filas justo después de que el operador
          // pulsó «Cargar más» tres veces.
          limit: Math.max(shownRef.current, PAGE_SIZE),
        });
      }
    });
  }, [loadOrders]);

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

  function reload(limit?: number) {
    return loadOrders({
      status: statusFilter,
      customerId: filters.customer,
      offset: 0,
      append: false,
      limit,
    });
  }

  function clearFilters() {
    setFilters({ status: "all", customer: "" });
    setCustomerSel(null);
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
    // Mismo criterio que el refresco por SSE: volver a la primera página trayendo
    // lo que ya estaba visible, para no colapsar la lista de quien venía de pulsar
    // «Cargar más».
    await reload(Math.max(orders.length, PAGE_SIZE));
    refreshPendingCount();
  }

  function pendingKind(orderId: string): "confirm" | "cancel" | null {
    return pendingAction?.id === orderId ? pendingAction.kind : null;
  }

  if (loading) return <Loading rows={3} label="Cargando pedidos…" />;
  // Solo cuando no hay NADA que mostrar: con filas en pantalla, un fallo del
  // refresco no puede sustituirlas por un cartel.
  if (error && orders.length === 0)
    return <ErrorState description={error} onRetry={() => reload()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => openEditor(null)}>
          <Plus className="size-4" />
          Nuevo pedido
        </Button>
      </div>

      <FilterBar active={hasFilters} onClear={clearFilters}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="orders-status">Estado</Label>
          <Select
            items={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={(v) => setFilters({ status: (v ?? "all") as StatusFilter })}
          >
            <SelectTrigger id="orders-status" className="w-44">
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="orders-customer">Cliente</Label>
          {/* El servidor ya aceptaba `customer_id` y `lib/api/orders.ts` ya lo
              serializaba: el filtro existía entero menos el control. «¿Qué le
              pedí a este cliente?» se contestaba abriendo su ficha. */}
          <CustomerCombobox
            id="orders-customer"
            className="w-64"
            value={customerSel}
            onChange={(c) => {
              setCustomerSel(c);
              setFilters({ customer: c?.id ?? "" });
            }}
          />
        </div>
      </FilterBar>

      {orders.length === 0 ? (
        // Dos vacíos distintos, y la diferencia no se deriva de la lista filtrada
        // (siempre vacía en ambos casos) sino de si hay filtro puesto: sin filtro,
        // la lista filtrada ES la lista completa.
        hasFilters ? (
          <EmptyState
            icon={Receipt}
            title="Sin resultados"
            description="Ningún pedido coincide con los filtros puestos."
            action={
              <Button variant="outline" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Receipt}
            title="Sin pedidos"
            description="Todavía no hay pedidos. Crea el primero desde el panel."
            action={
              <Button onClick={() => openEditor(null)}>
                <Plus className="size-4" />
                Nuevo pedido
              </Button>
            }
          />
        )
      ) : (
        <>
          <Table>
            <TableHeader>
              {/* Las columnas CAEN por breakpoint en vez de sobrevivir tras un
                  scroll horizontal. A 375px quedan ~327px útiles y la fila de un
                  borrador pedía ~666: Estado —lo único que la fila existe para
                  comunicar— terminaba detrás del degradado de scroll. N.º y Estado
                  se quedan siempre: el primero es el único acceso por teclado al
                  detalle, el segundo es la razón de mirar la tabla. */}
              <TableRow>
                <TableHead className="w-16">N.º</TableHead>
                {/* Los ítems NO van en la lista: son el contenido del pedido, y el
                    contenido se lee en el detalle. Acá la fila solo tiene que
                    identificar el pedido y decir en qué estado está. */}
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Total</TableHead>
                <TableHead className="w-28">Estado</TableHead>
                <TableHead className="hidden w-28 md:table-cell">Origen</TableHead>
                <TableHead className="hidden w-24 lg:table-cell">Fecha</TableHead>
                <TableHead className="md:w-60">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
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
                    <RowOpenButton
                      label={`Ver detalle del pedido ${order.id}`}
                      onOpen={() => setDetailId(order.id)}
                      className="font-medium text-muted-foreground tabular-nums hover:text-foreground"
                    >
                      #{order.id}
                    </RowOpenButton>
                  </TableCell>
                  {/* `whitespace-normal` deshace el `nowrap` global de la tabla: sin
                      él un "María Fernanda Rodríguez" fija el ancho mínimo de esta
                      columna y empuja Estado fuera de la pantalla. */}
                  <TableCell className="font-medium break-words whitespace-normal">
                    <span className="block">{order.customer}</span>
                    {/* El total baja acá cuando su columna cae, igual que el medio de
                        pago en /payments: es dato de la fila, no puede desaparecer
                        solo porque la pantalla sea angosta. */}
                    <span className="block text-xs font-normal text-muted-foreground tabular-nums sm:hidden">
                      {money(order.total)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {money(order.total)}
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <OrderOriginBadge createdByAi={order.created_by_ai} />
                  </TableCell>
                  <TableCell
                    className="hidden text-muted-foreground lg:table-cell"
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
                        confirmados y cancelados.
                        `flex-wrap` (y por eso un div, que un fragmento no acepta
                        `className`): en un borrador son cuatro controles, ~266px de
                        min-content en una sola línea que no caben en un teléfono. */}
                    <div className="flex flex-wrap items-center gap-2">
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
                            aria-label={`Editar pedido ${order.id}`}
                            onClick={() => openEditor(order)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          {/* El número va en el nombre accesible: con varias filas,
                              «Confirmar» a secas suena idéntico en todas y un lector
                              de pantalla no puede decir cuál se está por confirmar. */}
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Confirmar pedido ${order.id}`}
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
                            aria-label={`Cancelar pedido ${order.id}`}
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

          <ListFooter
            shown={orders.length}
            total={count}
            loading={listLoading}
            onLoadMore={() =>
              loadOrders({
                status: statusFilter,
                customerId: filters.customer,
                // `offset: orders.length`, igual que clientes. Tiene un borde
                // conocido: si una acción acabó de sacar una fila del filtro
                // vigente (confirmar con «Borrador» puesto la deja en pantalla
                // pero fuera del conjunto del servidor), la ventana del servidor
                // se corre y esta página se salta un pedido. La alternativa —un
                // keyset por cursor— la tiene pagos y esta ruta no la ofrece.
                offset: orders.length,
                append: true,
              })
            }
          />
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
