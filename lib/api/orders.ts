import { api } from "./client";

export type OrderStatus = "draft" | "confirmed" | "cancelled";

export interface OrderLine {
  product_name: string;
  quantity: number;
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
      product_name: i.product_name,
      quantity: i.quantity,
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
