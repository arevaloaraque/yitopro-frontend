/**
 * OrdersPanel — renders orders, confirm/cancel call the API and refresh the
 * shared pending-draft count (the sidebar badge), and pedido SSE events refetch
 * the list so a draft the sales agent creates shows up live.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api";
import { listOrders, confirmOrder, cancelOrder } from "@/lib/api";
import type { SSEEvent } from "@/lib/types";

import { OrdersPanel } from "../orders-panel";

vi.mock("@/lib/api");

const refreshPendingCount = vi.fn();
vi.mock("@/lib/orders", () => ({
  usePendingOrders: () => ({ pendingCount: 0, refresh: refreshPendingCount }),
}));

const { sseHandlers } = vi.hoisted(() => ({
  sseHandlers: [] as ((event: SSEEvent) => void)[],
}));
vi.mock("@/lib/sse", () => ({
  subscribeToEvents: (handler: (event: SSEEvent) => void) => {
    sseHandlers.push(handler);
    return () => {};
  },
}));

function emitSse(event: SSEEvent) {
  for (const handler of sseHandlers) handler(event);
}

function makeOrder(over: Partial<Order> = {}): Order {
  return {
    id: "ord-1",
    customer: "Ana",
    items: [{ product_id: "p1", product_name: "Croquetas", quantity: 2, unit_price: 15 }],
    total: 33,
    status: "draft",
    created_by_ai: true,
    created_at: "2026-07-13T10:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.length = 0;
  vi.mocked(listOrders).mockResolvedValue([makeOrder()]);
  vi.mocked(confirmOrder).mockResolvedValue(makeOrder({ status: "confirmed" }));
  vi.mocked(cancelOrder).mockResolvedValue(makeOrder({ status: "cancelled" }));
});

describe("OrdersPanel", () => {
  it("renders orders from the API with the unit price in the items label", async () => {
    render(<OrdersPanel />);
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    // PEDIDOS-05: the items label carries name ×qty (unit price).
    expect(screen.getByText(/Croquetas ×2 \(.*15.*\)/)).toBeInTheDocument();
    expect(screen.getByText("Borrador")).toBeInTheDocument();
  });

  it("truncates the items cell and exposes the full list via title", async () => {
    render(<OrdersPanel />);
    const cell = await screen.findByText(/Croquetas ×2/);
    expect(cell).toHaveAttribute("title", expect.stringContaining("Croquetas ×2"));
    expect(cell).toHaveClass("truncate", "max-w-[24rem]");
  });

  it("confirming a draft calls the API and refreshes the badge count", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(confirmOrder).toHaveBeenCalledWith("ord-1"));
    expect(refreshPendingCount).toHaveBeenCalled();
  });

  it("cancelling a draft calls the API and refreshes the badge count", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(cancelOrder).toHaveBeenCalledWith("ord-1"));
    expect(refreshPendingCount).toHaveBeenCalled();
  });

  it("refetches the list on a pedido SSE event", async () => {
    render(<OrdersPanel />);
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));
    emitSse({
      id: "e1",
      type: "pedido_borrador_creado",
      emitted_at: "2026-07-13T10:01:00Z",
      data: { order_id: "2", total: "10", customer_id: "1" },
    } as SSEEvent);
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
  });

  it("refetches the list when a draft is modified (pedido_borrador_actualizado)", async () => {
    render(<OrdersPanel />);
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));
    emitSse({
      id: "e2",
      type: "pedido_borrador_actualizado",
      emitted_at: "2026-07-13T10:02:00Z",
      data: { order_id: "2", total: "20", customer_id: "1" },
    } as SSEEvent);
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
  });
});
