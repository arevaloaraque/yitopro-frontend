import { api } from "./client";

export type OrderStatus = "draft" | "confirmed" | "cancelled";

export interface OrderLine {
  /** Product reference (needed to pre-seed the item editor when editing a draft). */
  product_id: string;
  product_name: string;
  quantity: number;
  /** Unit price at the time of the order (backend Decimal string → number). */
  unit_price: number;
}

/** Tenant order (mirrors `OrderOut`, with names already resolved). */
export interface Order {
  id: string;
  customer: string;
  items: OrderLine[];
  total: number;
  status: OrderStatus;
  created_by_ai: boolean;
  created_at: string;
}

interface BackendOrderItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: string;
}

interface BackendOrder {
  id: number;
  customer_id: number;
  customer_name: string;
  status: OrderStatus;
  total: string;
  created_by_ai: boolean;
  created_at: string;
  items: BackendOrderItem[];
}

function fromBackend(o: BackendOrder): Order {
  return {
    id: String(o.id),
    customer: o.customer_name,
    items: o.items.map((i) => ({
      product_id: String(i.product_id),
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
    })),
    total: Number(o.total),
    status: o.status,
    created_by_ai: o.created_by_ai,
    created_at: o.created_at,
  };
}

/** List of the business's orders (created by the sales agent or the panel). */
export async function listOrders(status?: OrderStatus): Promise<Order[]> {
  const res = await api.get<BackendOrder[]>("/orders/", { query: { status } });
  return res.map(fromBackend);
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
export async function updateOrder(
  id: string,
  items: OrderItemInput[],
): Promise<Order> {
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
