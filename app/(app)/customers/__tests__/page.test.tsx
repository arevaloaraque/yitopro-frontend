/**
 * Customers page — live refresh on customer-domain SSE events.
 *
 * When another operator (or the WhatsApp auto-create path) adds/edits a
 * customer, the list must refetch instead of going stale.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Customer, SSEEvent } from "@/lib/types";
import { createCustomer, searchCustomers } from "@/lib/api/customers";
import { listConversations } from "@/lib/api/conversations";

import CustomersPage from "../page";

vi.mock("@/lib/api/customers");
vi.mock("@/lib/api/conversations");
vi.mock("@/lib/api/records");

const { toastFns } = vi.hoisted(() => ({
  toastFns: { base: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => {
  const toast = Object.assign(toastFns.base, {
    success: toastFns.success,
    warning: toastFns.warning,
    error: toastFns.error,
  });
  return { toast };
});

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

function makeCustomer(over: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    name: "Ana",
    phone: "+56911111111",
    email: "",
    created_at: "2026-07-11T10:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.length = 0;
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(searchCustomers).mockResolvedValue({ items: [makeCustomer()], count: 1 });
});

describe("CustomersPage — SSE freshness", () => {
  it("refetches the list when a customer is created elsewhere", async () => {
    render(<CustomersPage />);
    // Initial load.
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));

    emitSse({
      id: "e1",
      type: "cliente_creado",
      emitted_at: "2026-07-11T10:01:00Z",
      data: { customer_id: "cust-2", origin: "whatsapp" },
    } as SSEEvent);

    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(2));
  });

  it("refetches the list when a customer is updated elsewhere", async () => {
    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Ana")).toBeInTheDocument();

    emitSse({
      id: "e2",
      type: "cliente_actualizado",
      emitted_at: "2026-07-11T10:01:00Z",
      data: { customer_id: "cust-1", fields: ["email"] },
    } as SSEEvent);

    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(2));
  });

  it("refreshes the conversation-count badge on mensaje_recibido", async () => {
    render(<CustomersPage />);
    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(1));

    emitSse({
      id: "m1",
      type: "mensaje_recibido",
      emitted_at: "2026-07-11T10:01:00Z",
      data: { conversation_id: "conv-1", message_id: "msg-1" },
    } as SSEEvent);

    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(2));
  });
});

describe("CustomersPage — crear cliente", () => {
  it("muestra toast de éxito al crear un cliente nuevo (A11Y-04)", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({
      customer: makeCustomer({ id: "cust-9", name: "Pedro" }),
      created: true,
    });

    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /nuevo cliente/i }));
    await user.type(screen.getByLabelText("Nombre"), "Pedro");
    await user.type(screen.getByLabelText("Teléfono"), "+56922222222");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() => expect(toastFns.success).toHaveBeenCalledWith("Cliente creado"));
  });
});
