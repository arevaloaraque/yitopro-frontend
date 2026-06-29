import { api } from "./client";

export type OrderStatus = "draft" | "confirmed" | "cancelled";

export interface OrderLine {
  product_name: string;
  quantity: number;
}

/** Pedido del tenant (reflejo de `OrderOut`, con nombres ya resueltos). */
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

/** Lista de pedidos del negocio (los crea el agente de ventas o el panel). */
export async function listOrders(status?: OrderStatus): Promise<Order[]> {
  const res = await api.get<BackendOrder[]>("/orders/", { query: { status } });
  return res.map(fromBackend);
}
