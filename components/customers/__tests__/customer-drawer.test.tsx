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
    rating_avg: null,
    rating_count: 0,
  });
  vi.mocked(getRecord).mockResolvedValue(makeRecord());
  vi.mocked(getCustomerNotes).mockResolvedValue([]);
  // El inbox se pagina por cursor: el mock devuelve el sobre, no el array.
  vi.mocked(listConversations).mockResolvedValue({
    items: [],
    next_cursor: "",
    has_more: false,
  });
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

describe("CustomerDrawer — calificación e historial", () => {
  it("pide SOLO las conversaciones de este cliente al servidor", async () => {
    renderDrawer();
    await screen.findByDisplayValue("Ana");
    // Antes bajaba la tabla completa del negocio y filtraba en el navegador por
    // `customer_id`; el filtro vive ahora en el endpoint.
    expect(vi.mocked(listConversations)).toHaveBeenCalledWith({ customerId: "cust-1" });
  });

  it("muestra el promedio del cliente diciendo de quién es", async () => {
    vi.mocked(getCustomer).mockResolvedValue({
      id: "cust-1",
      name: "Ana",
      phone: "+56911111111",
      email: "",
      created_at: "2026-07-11T10:00:00Z",
      rating_avg: 4.5,
      rating_count: 2,
    });
    renderDrawer();
    await screen.findByDisplayValue("Ana");
    expect(screen.getByLabelText("4,5 de 5")).toBeTruthy();
    expect(screen.getByText(/· 2 conversaciones/)).toBeTruthy();
  });

  it("lista el historial con la nota de cada hilo y un enlace para abrirlo", async () => {
    vi.mocked(listConversations).mockResolvedValue({
      items: [
        {
          id: "conv-9",
          customer_id: "cust-1",
          customer_name: "Ana",
          customer_phone: "+56911111111",
          status: "closed",
          active_agent: null,
          assignee_id: null,
          last_message_at: "2026-07-30T18:00:00Z",
          unread: 0,
          customer_rating: 2,
          rating_status: "rated",
          customer_rating_avg: null,
          customer_rating_count: 0,
          last_message_preview: "",
          last_message_direction: "",
          last_message_sender_kind: "",
        },
        {
          id: "conv-10",
          customer_id: "cust-1",
          customer_name: "Ana",
          customer_phone: "+56911111111",
          status: "ai_active",
          active_agent: "sales",
          assignee_id: null,
          last_message_at: "2026-07-31T09:00:00Z",
          unread: 0,
          customer_rating: null,
          rating_status: "pending",
          customer_rating_avg: null,
          customer_rating_count: 0,
          last_message_preview: "",
          last_message_direction: "",
          last_message_sender_kind: "",
        },
      ],
      next_cursor: "",
      has_more: false,
    });
    renderDrawer();
    await screen.findByDisplayValue("Ana");

    // El hilo calificado muestra su nota; el pendiente dice por qué no la tiene —
    // nunca un 0, que se leería como la peor calificación posible.
    expect(screen.getByLabelText("2 de 5")).toBeTruthy();
    expect(screen.getByText("Sin calificar aún")).toBeTruthy();

    // Y cada fila es navegable al inbox, que acepta `?id=`.
    const links = screen.getAllByRole("link");
    const hrefs = links.map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/conversations?id=conv-9");
    expect(hrefs).toContain("/conversations?id=conv-10");
  });
});
