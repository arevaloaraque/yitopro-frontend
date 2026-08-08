"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Info, Mail, Phone } from "lucide-react";

import type { Order, OrderLine } from "@/lib/api";
import { useMoney } from "@/lib/business";
import { formatNumber } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Lines whose quantity exceeds what's on hand — a confirm would 409 on these. */
export function shortLines(order: Order): OrderLine[] {
  return order.items.filter((i) => i.quantity > i.product_stock);
}

/**
 * `customer_name` falls back to the raw phone server-side, so an equal value means the
 * customer has no display name (the usual case for a WhatsApp-created one). Show the
 * formatted phone instead of the raw string, which is the panel's convention elsewhere.
 */
export function orderDisplayName(order: Order): string {
  return order.customer === order.customer_phone
    ? formatNumber(order.customer_phone)
    : order.customer;
}

/**
 * El cuerpo del detalle de un pedido: contacto, líneas y total.
 *
 * Hoy lo usa SOLO la modal. Se extrajo para compartirlo con la hoja de impresión, pero el
 * comprobante terminó siendo texto plano —otro formato, no el de la pantalla—, así que esa
 * razón ya no aplica: queda separado porque mantiene el diálogo legible, no porque se
 * comparta. Lo que sí siguen compartiendo ambos es `orderDisplayName`.
 */
export function OrderDetailBody({ order }: { order: Order }) {
  const money = useMoney();
  const isDraft = order.status === "draft";

  return (
    <>
      {/* Contact data, not just a name: an order is something you may have to call
          about (a product went out of stock, a pickup needs arranging), and the
          operator should not have to go hunting for the number. */}
      <div className="mb-4 space-y-2 rounded-xl border border-border/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{orderDisplayName(order)}</p>
          <Link
            href={`/customers?id=${order.customer_id}`}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground underline underline-offset-3 hover:text-foreground"
          >
            Ver cliente
            <ChevronRight className="size-3" aria-hidden />
          </Link>
        </div>
        <div className="flex flex-col gap-1 text-sm">
          {/* `tel:` and `mailto:` are the platform's own contact affordances — no
              library, and they do the right thing on desktop and on a phone.
              The stored phone has NO `+` (verified against live data:
              "56922591206"), and `tel:` without it dials as a local number. */}
          <a
            href={`tel:+${order.customer_phone.replace(/\D/g, "")}`}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Phone className="size-3.5 shrink-0" aria-hidden />
            {formatNumber(order.customer_phone)}
          </a>
          {order.customer_email ? (
            <a
              href={`mailto:${order.customer_email}`}
              className="inline-flex items-center gap-1.5 break-all text-muted-foreground hover:text-foreground"
            >
              <Mail className="size-3.5 shrink-0" aria-hidden />
              {order.customer_email}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground/70">
              <Mail className="size-3.5 shrink-0" aria-hidden />
              Sin email
            </span>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead className="w-16 text-right">Cant.</TableHead>
            <TableHead className="w-24 text-right">P. unit.</TableHead>
            <TableHead className="w-28 text-right">Subtotal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {order.items.map((line) => (
            <TableRow key={line.product_id}>
              <TableCell className="font-medium">
                {line.product_name}
                {isDraft && line.quantity > line.product_stock && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-destructive">
                    <AlertTriangle className="size-3" aria-hidden />
                    Quedan {line.product_stock}
                  </span>
                )}
                {line.unit_price !== line.product_price && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <Info className="size-3" aria-hidden />
                    Precio actual {money(line.product_price)}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">
                {money(line.unit_price)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(line.subtotal)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{money(order.total)}</span>
      </div>
    </>
  );
}
