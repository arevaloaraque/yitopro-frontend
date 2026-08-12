import type { Paginated } from "@/lib/types";

import { api } from "./client";

export type OrderStatus = "draft" | "confirmed" | "cancelled";

export interface OrderLine {
  /** Product reference (needed to pre-seed the item editor when editing a draft). */
  product_id: string;
  product_name: string;
  quantity: number;
  /** Unit price at the time of the order (backend Decimal string → number). */
  unit_price: number;
  /** `unit_price * quantity`, computed server-side so the panel never re-derives money. */
  subtotal: number;
  /**
   * What the product costs TODAY. Differs from `unit_price` when the product was
   * re-priced after the draft was built — the detail view says so instead of letting
   * the operator confirm an old price without noticing.
   */
  product_price: number;
  /** Current on-hand stock, so the detail view can warn before a confirm 409s. */
  product_stock: number;
}

/** Tenant order (mirrors `OrderOut`, with names already resolved). */
export interface Order {
  id: string;
  /** Customer display name (falls back to the phone server-side). */
  customer: string;
  /** Kept so the detail view can link to the customer's drawer. */
  customer_id: string;
  /** Contact data for the detail view — how the operator reaches them about this order. */
  customer_phone: string;
  /** Empty string when the customer has no email (most WhatsApp-created ones). */
  customer_email: string;
  items: OrderLine[];
  total: number;
  status: OrderStatus;
  created_by_ai: boolean;
  created_at: string;
  /** Last movement. There is no confirmed_at/cancelled_at, so this is all there is. */
  updated_at: string;
}

interface BackendOrderItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  product_price: string;
  product_stock: number;
}

interface BackendOrder {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  status: OrderStatus;
  total: string;
  created_by_ai: boolean;
  created_at: string;
  updated_at: string;
  items: BackendOrderItem[];
}

function fromBackend(o: BackendOrder): Order {
  return {
    id: String(o.id),
    customer: o.customer_name,
    customer_id: String(o.customer_id),
    customer_phone: o.customer_phone,
    customer_email: o.customer_email,
    items: o.items.map((i) => ({
      product_id: String(i.product_id),
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      subtotal: Number(i.subtotal),
      product_price: Number(i.product_price),
      product_stock: i.product_stock,
    })),
    total: Number(o.total),
    status: o.status,
    created_by_ai: o.created_by_ai,
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
}

interface Page {
  items: BackendOrder[];
  count: number;
}

/**
 * List of the business's orders (created by the sales agent or the panel).
 *
 * Devuelve el sobre paginado del backend (`@paginate`: `{items, count}`, NO un
 * array) tal cual, con `limit`/`offset` reales. Antes pedía `limit: 500` fijo y
 * el panel recortaba en memoria: el pie decía «Mostrando 20 de 500» y ese 500
 * era el tope que inventaba esta función, no lo que tiene el tenant — o sea que
 * el número mentía, y a partir de la fila 501 los pedidos no existían.
 *
 * `limit` va explícito porque el default del servidor es 100: callarlo trunca en
 * silencio, y una lista cortada se lee como completa.
 */
export async function listOrders(
  status?: OrderStatus,
  opts: { customer_id?: string; limit?: number; offset?: number } = {},
): Promise<Paginated<Order>> {
  const res = await api.get<Page>("/orders/", {
    query: {
      status,
      customer_id: opts.customer_id,
      limit: opts.limit ?? 20,
      offset: opts.offset ?? 0,
    },
  });
  return { items: res.items.map(fromBackend), count: res.count };
}

/** A line to send when creating/replacing an order's items. */
export interface OrderItemInput {
  product_id: string;
  quantity: number;
}

/**
 * Creates a draft order from the panel (manual sale). `created_by_ai` defaults
 * to false server-side (the panel is a human). Throws `ApiError` 400/404 on a
 * missing/non-sellable product or bad quantity.
 */
export async function createOrder(input: {
  customer_id: string;
  items: OrderItemInput[];
}): Promise<Order> {
  const res = await api.post<BackendOrder>("/orders/", {
    customer_id: Number(input.customer_id),
    items: input.items.map((i) => ({
      product_id: Number(i.product_id),
      quantity: i.quantity,
    })),
  });
  return fromBackend(res);
}

/** Replaces a draft order's items (the customer is fixed by the order). PATCH /orders/{id}/. */
export async function updateOrder(id: string, items: OrderItemInput[]): Promise<Order> {
  const res = await api.patch<BackendOrder>(`/orders/${id}/`, {
    items: items.map((i) => ({
      product_id: Number(i.product_id),
      quantity: i.quantity,
    })),
  });
  return fromBackend(res);
}

/** Confirms a draft order (decrements stock). Throws `ApiError` 409 on insufficient stock. */
export async function confirmOrder(id: string): Promise<Order> {
  const res = await api.patch<BackendOrder>(`/orders/${id}/confirm/`);
  return fromBackend(res);
}

/** Cancels a draft order. */
export async function cancelOrder(id: string): Promise<Order> {
  const res = await api.patch<BackendOrder>(`/orders/${id}/cancel/`);
  return fromBackend(res);
}

/** Number of draft orders awaiting confirmation (drives the "Pedidos" nav badge). */
export async function getPendingOrdersCount(): Promise<number> {
  const res = await api.get<{ count: number }>("/orders/pending-count/");
  return res.count;
}
