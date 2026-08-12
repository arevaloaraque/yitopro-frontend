"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  Loader2,
  MessageSquare,
  Pencil,
} from "lucide-react";

import type { Order } from "@/lib/api";
import { listConversations } from "@/lib/api/conversations";
import type { Conversation } from "@/lib/types";
import { formatDateTime, relativeTime } from "@/lib/format/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OrderDetailBody, shortLines } from "./order-detail-content";
import { OrderOriginBadge, OrderStatusBadge } from "./order-meta";

interface OrderDetailDialogProps {
  /** Non-null means open — the list owns the state (same shape as CustomerDrawer). */
  order: Order | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (order: Order) => void;
  onConfirm: (order: Order) => void;
  onCancel: (order: Order) => void;
  /** Which action is in flight, so the right button shows the spinner. */
  pending: "confirm" | "cancel" | null;
}

/**
 * Short labels only. The conversations block here answers "is this thread still live?" so
 * the operator knows whether replying is free or needs an approved template; the inbox is
 * where the full state (and its colour coding) belongs.
 */
const CONV_STATUS_LABELS: Record<Conversation["status"], string> = {
  ai_active: "IA activa",
  human_handoff: "Derivada",
  closed: "Cerrada",
};

/**
 * Read-only detail of one order.
 *
 * Purely presentational as far as the order goes: `GET /api/orders/` returns every order
 * WITH its lines, so the row hands over the object it already has and this dialog never
 * refetches it. (It IS paginated — the old comment here claimed otherwise and that was
 * how a `res.map is not a function` shipped: the envelope changed and the docs did not.
 * Pagination is irrelevant to this dialog, which is handed one row, but it is not
 * irrelevant to whoever reads this next.)
 * Being handed the row is also why this works for a CONFIRMED order — before this drawer existed the
 * structured lines lived only in the edit dialog, which opens for drafts only, so
 * confirming an order made its own contents permanently unreachable.
 */
export function OrderDetailDialog({
  order,
  onOpenChange,
  onEdit,
  onConfirm,
  onCancel,
  pending,
}: OrderDetailDialogProps) {
  // Both results are TAGGED with the customer they belong to, and the render state is
  // derived from that tag rather than set inside the effect. Two things fall out: no
  // synchronous setState in an effect, and moving from one order to another reads as
  // "loading" immediately instead of briefly showing the previous customer's threads.
  const [convRows, setConvRows] = useState<{
    customerId: string;
    rows: Conversation[];
  } | null>(null);
  const [convFailedFor, setConvFailedFor] = useState<string | null>(null);
  // Guards against a stale response landing after a newer one (same as CustomerDrawer).
  const reqRef = useRef(0);
  const customerId = order?.customer_id ?? null;

  useEffect(() => {
    if (!customerId) return;
    const reqId = ++reqRef.current;
    listConversations({ customerId })
      // `.items`: el inbox pasó a paginarse por cursor. Basta la primera página:
      // esto rotula «las conversaciones DEL CLIENTE», no el hilo que originó el
      // pedido — esa relación no existe en el modelo.
      .then((page) => {
        if (reqId === reqRef.current) setConvRows({ customerId, rows: page.items });
      })
      .catch(() => {
        if (reqId === reqRef.current) setConvFailedFor(customerId);
      });
  }, [customerId]);

  if (!order) return null;

  const conversations = convRows?.customerId === customerId ? convRows.rows : null;
  const convState =
    convFailedFor === customerId
      ? "error"
      : conversations === null
        ? "loading"
        : "ready";

  const isDraft = order.status === "draft";
  const short = isDraft ? shortLines(order) : [];
  const busy = pending !== null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* Same layout as the editor dialog, and for the same reason: three grid rows
          (`auto / minmax(0,1fr) / auto`) so ONLY the middle scrolls and the actions never
          scroll out of reach. `max-h-[85vh]` keeps a long order inside the viewport. */}
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pedido #{order.id}</DialogTitle>
          <DialogDescription>{formatDateTime(order.created_at)}</DialogDescription>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <OrderOriginBadge createdByAi={order.created_by_ai} />
          </div>
        </DialogHeader>

        {/* `min-h-0` is what lets a grid row shrink below its content so this one, and
            only this one, scrolls. */}
        <div className="flex min-h-0 flex-col overflow-y-auto pr-1">
          {/* Contacto, líneas y total viven en su propio componente para que este archivo
              se lea: acá abajo siguen las conversaciones y el pie de acciones. */}
          <OrderDetailBody order={order} />

          {/* «Del cliente», no «del pedido»: no existe relación Order → Conversation en el
              modelo (ni FK, ni `order_id` en AILog), así que vincular un pedido con el chat
              exacto que lo originó no es derivable hoy. Adivinarlo por cercanía de fechas
              se leería como un dato duro sin serlo. Para un pedido de WhatsApp el hilo
              reciente es en la práctica el que corresponde. */}
          <div className="mt-4 mb-2 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <MessageSquare className="size-3.5" aria-hidden />
              Conversaciones del cliente
              {convState === "ready" && (conversations ?? []).length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({(conversations ?? []).length})
                </span>
              )}
            </p>
            {convState === "loading" && (
              <p className="text-xs text-muted-foreground">Cargando conversaciones…</p>
            )}
            {convState === "error" && (
              <p className="text-xs text-muted-foreground">
                No se pudieron cargar las conversaciones.
              </p>
            )}
            {convState === "ready" && (conversations ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sin conversaciones. Este pedido no vino por WhatsApp.
              </p>
            )}
            {convState === "ready" && (conversations ?? []).length > 0 && (
              <ul className="space-y-1.5">
                {(conversations ?? []).map((conv) => (
                  <li key={conv.id}>
                    <Link
                      href={`/conversations?id=${conv.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/30 px-3 py-2 transition-colors hover:border-border hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-foreground">
                          {formatDateTime(conv.last_message_at)}
                        </span>
                        <span className="block text-[0.65rem] text-muted-foreground">
                          {relativeTime(conv.last_message_at)}
                        </span>
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[0.65rem]">
                        {CONV_STATUS_LABELS[conv.status]}
                      </Badge>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* A cancelled order has nothing to act on: rendering the footer anyway would
            leave a padded empty box under the total. */}
        {(isDraft || order.status === "confirmed") && (
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
            {short.length > 0 && (
              <p
                role="alert"
                className="flex items-start gap-1.5 rounded-lg border border-destructive/25 bg-destructive/10 p-2 text-xs text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  No hay stock para{" "}
                  {short.length === 1 ? "un producto" : `${short.length} productos`}. Si
                  confirmás ahora, el pedido se rechaza.
                </span>
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {isDraft && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onEdit(order)}
                >
                  <Pencil className="size-4" />
                  Editar
                </Button>
              )}
              {/* Always available inside this footer, which only renders for a draft or a
                  confirmed order. A CONFIRMED one can be cancelled here and nowhere else:
                  it reverses stock, so it has no business on a row you might click in
                  passing. */}
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => onCancel(order)}
              >
                {pending === "cancel" && <Loader2 className="size-4 animate-spin" />}
                Cancelar
              </Button>
              {isDraft && (
                <Button size="sm" disabled={busy} onClick={() => onConfirm(order)}>
                  {pending === "confirm" && <Loader2 className="size-4 animate-spin" />}
                  Confirmar
                </Button>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
