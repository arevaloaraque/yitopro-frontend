/**
 * CustomerDrawer — live refresh while open, with an anti-clobber guard.
 *
 * The AI can edit a customer's ficha mid-conversation, so an open drawer must
 * reflect it. But a remote change must NEVER wipe the operator's unsaved edits,
 * and must be ignored if it targets a different customer.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomerRecord, SSEEvent } from "@/lib/types";
import { getCustomer, getCustomerNotes } from "@/lib/api/customers";
import { getRecord } from "@/lib/api/records";
import { listConversations } from "@/lib/api/conversations";

import { CustomerDrawer } from "../customer-drawer";

vi.mock("@/lib/api/customers");
vi.mock("@/lib/api/records");
vi.mock("@/lib/api/conversations");

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
  act(() => {
    for (const handler of sseHandlers) handler(event);
  });
}

function makeRecord(): CustomerRecord {
  return {
    id: "rec-1",
    customer_id: "cust-1",
    schema: [
      {
        name: "weight_kg",
        label: "Peso",
        type: "number",
        required: false,
        ai_visible: true,
        ai_editable: true,
      },
    ],
    values: { weight_kg: 12.5 },
    updated_at: "2026-07-11T10:00:00Z",
    audit: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.length = 0;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(getCustomer).mockResolvedValue({
    id: "cust-1",
    name: "Ana",
    phone: "+56911111111",
    email: "",
    created_at: "2026-07-11T10:00:00Z",
  });
  vi.mocked(getRecord).mockResolvedValue(makeRecord());
  vi.mocked(getCustomerNotes).mockResolvedValue([]);
  vi.mocked(listConversations).mockResolvedValue([]);
});

function renderDrawer() {
  return render(
    <CustomerDrawer
      customerId="cust-1"
      onOpenChange={() => {}}
      onCustomerSaved={() => {}}
    />,
  );
}

const fichaEvent = (customer_id: string): SSEEvent =>
  ({
    id: "f1",
    type: "ficha_actualizada",
    emitted_at: "2026-07-11T10:01:00Z",
    data: { customer_id, record_id: "rec-1", changed_by: "ai", fields: ["weight_kg"] },
  }) as SSEEvent;

describe("CustomerDrawer — live refresh", () => {
  it("refetches notes when a note is added to the open customer", async () => {
    renderDrawer();
    await waitFor(() => expect(getCustomerNotes).toHaveBeenCalledTimes(1));

    emitSse({
      id: "n1",
      type: "nota_creada",
      emitted_at: "2026-07-11T10:01:00Z",
      data: { customer_id: "cust-1", note_id: "note-9", author: "human" },
    } as SSEEvent);

    await waitFor(() => expect(getCustomerNotes).toHaveBeenCalledTimes(2));
  });

  it("refetches the ficha when the AI updates it and there are no unsaved edits", async () => {
    renderDrawer();
    await waitFor(() => expect(getRecord).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("spinbutton")).toBeInTheDocument();

    emitSse(fichaEvent("cust-1"));

    await waitFor(() => expect(getRecord).toHaveBeenCalledTimes(2));
  });

  it("ignores a ficha update for a different customer", async () => {
    renderDrawer();
    await waitFor(() => expect(getRecord).toHaveBeenCalledTimes(1));

    emitSse(fichaEvent("cust-999"));

    expect(getRecord).toHaveBeenCalledTimes(1);
  });

  it("does NOT clobber unsaved ficha edits on a remote update", async () => {
    renderDrawer();
    const input = await screen.findByRole("spinbutton");

    // Operator edits the weight but hasn't saved.
    await userEvent.clear(input);
    await userEvent.type(input, "20");
    expect(input).toHaveValue(20);

    emitSse(fichaEvent("cust-1"));

    // The record must not be refetched/reapplied — the edit stands.
    expect(getRecord).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue(20);
  });
});
