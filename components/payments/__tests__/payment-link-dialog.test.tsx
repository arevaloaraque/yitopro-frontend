/**
 * The payment-link dialog.
 *
 * What is worth pinning: the charge targets a cita OR a pedido and never both
 * (the backend answers 400 for the pair, so the UI must not be able to send
 * it), the lists are scoped to the chosen customer, and picking either one
 * loads its registered amount rather than leaving the operator to type it.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPaymentLink } from "@/lib/api/payments";
import { listAppointments } from "@/lib/api/appointments";
import { listOrders } from "@/lib/api/orders";
import type { Appointment } from "@/lib/types";
import type { Order } from "@/lib/api/orders";

import { PaymentLinkDialog } from "../payment-link-dialog";

vi.mock("@/lib/api/payments");
vi.mock("@/lib/api/appointments");
vi.mock("@/lib/api/orders");
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { customers } = vi.hoisted(() => ({
  customers: [{ id: "7", name: "Ana Fuentes", phone: "+56911111111" }],
}));
vi.mock("@/lib/api/customers", () => ({
  searchCustomers: async () => ({ items: customers, count: customers.length }),
}));

function appointment(over: Partial<Appointment> = {}): Appointment {
  return {
    id: "12",
    service_id: "3",
    professional_id: "1",
    customer_id: "7",
    customer_name: "Ana Fuentes",
    start: "2026-08-05T13:00:00Z",
    end: "2026-08-05T13:30:00Z",
    status: "confirmed",
    created_by: "human",
    notes: null,
    service_name: "Corte de pelo",
    service_price: 15000,
    ...over,
  } as Appointment;
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: "31",
    customer: "Ana Fuentes",
    customer_id: "7",
    customer_phone: "+56911111111",
    customer_email: "",
    items: [],
    total: 24000,
    status: "confirmed",
    created_by_ai: false,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
    ...over,
  };
}

async function pickCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText(/cliente/i));
  const option = await screen.findByRole("option", { name: /ana fuentes/i });
  await user.click(option);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Las dos listas devuelven el sobre paginado del backend, no un array.
  vi.mocked(listAppointments).mockResolvedValue({ items: [appointment()], count: 1 });
  vi.mocked(listOrders).mockResolvedValue({ items: [order()], count: 1 });
  vi.mocked(createPaymentLink).mockResolvedValue({
    public_id: "abc",
    url: "https://app.test/pagar/abc/?t=secret",
    concept: "Cita",
    amount: 15000,
    currency: "CLP",
    expires_at: "2026-08-03T00:00:00Z",
    customer_id: "7",
  });
});

describe("PaymentLinkDialog", () => {
  it("offers the customer's citas and pedidos, and nothing else", async () => {
    const user = userEvent.setup();
    render(<PaymentLinkDialog open onOpenChange={() => {}} />);
    await pickCustomer(user);

    // Both lists are asked for BY CUSTOMER. Unscoped, the operator could attach
    // a stranger's cita to this charge.
    // Y con `limit` explícito: este Select no tiene «cargar más», así que el
    // default del servidor (100 en citas) decidía en silencio qué se podía cobrar.
    await waitFor(() =>
      expect(listAppointments).toHaveBeenCalledWith({ customer_id: "7", limit: 50 }),
    );
    expect(listOrders).toHaveBeenCalledWith(undefined, {
      customer_id: "7",
      limit: 50,
    });

    await user.click(screen.getByLabelText(/cita o pedido/i));
    expect(await screen.findByRole("option", { name: /^Cita/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Pedido #31/ })).toBeInTheDocument();
    // Services are not a thing you charge for here — an order is.
    expect(screen.queryByLabelText(/servicio/i)).not.toBeInTheDocument();
  });

  it("entrega el enlace acuñado a onCreated — el caller lo necesita para el anti-eco", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<PaymentLinkDialog open onOpenChange={() => {}} onCreated={onCreated} />);
    await pickCustomer(user);
    await user.click(screen.getByLabelText(/cita o pedido/i));
    await user.click(await screen.findByRole("option", { name: /^Cita/ }));
    await user.click(screen.getByRole("button", { name: /generar enlace/i }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ public_id: "abc" }),
      ),
    );
  });

  it("loads the cita's registered price and sends appointment_id alone", async () => {
    const user = userEvent.setup();
    render(<PaymentLinkDialog open onOpenChange={() => {}} />);
    await pickCustomer(user);
    await user.click(screen.getByLabelText(/cita o pedido/i));
    await user.click(await screen.findByRole("option", { name: /^Cita/ }));

    // Of record, not a guess: it comes off the appointment's service, resolved
    // server-side so the panel never fetches the catalogue to price a booking.
    expect(screen.getByLabelText(/monto/i)).toHaveValue(15000);

    await user.click(screen.getByRole("button", { name: /generar enlace/i }));
    await waitFor(() => expect(createPaymentLink).toHaveBeenCalled());
    const sent = vi.mocked(createPaymentLink).mock.calls[0][0];
    expect(sent.appointment_id).toBe("12");
    expect(sent.order_id).toBeUndefined();
    expect(sent.amount).toBe(15000);
  });

  it("fills the amount from a pedido's frozen total", async () => {
    const user = userEvent.setup();
    render(<PaymentLinkDialog open onOpenChange={() => {}} />);
    await pickCustomer(user);
    await user.click(screen.getByLabelText(/cita o pedido/i));
    await user.click(await screen.findByRole("option", { name: /Pedido #31/ }));

    expect(screen.getByLabelText(/monto/i)).toHaveValue(24000);
    await user.click(screen.getByRole("button", { name: /generar enlace/i }));
    await waitFor(() => expect(createPaymentLink).toHaveBeenCalled());
    const sent = vi.mocked(createPaymentLink).mock.calls[0][0];
    expect(sent.order_id).toBe("31");
    expect(sent.appointment_id).toBeUndefined();
  });

  it("requires an amount for a loose charge", async () => {
    const user = userEvent.setup();
    render(<PaymentLinkDialog open onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText(/concepto/i), "Abono");
    await user.click(screen.getByRole("button", { name: /generar enlace/i }));
    expect(await screen.findByText("Requerido")).toBeInTheDocument();
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("makes the operator copy the link before it is gone", async () => {
    const user = userEvent.setup();
    render(<PaymentLinkDialog open onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText(/concepto/i), "Abono");
    await user.type(screen.getByLabelText(/monto/i), "5000");
    await user.click(screen.getByRole("button", { name: /generar enlace/i }));

    // The 201 is the only place the secret ever exists, so the dialog stays
    // open on success and says so.
    expect(await screen.findByDisplayValue(/pagar\/abc/)).toBeInTheDocument();
    expect(screen.getByText(/no podemos[\s\S]*recuperarlo/i)).toBeInTheDocument();
  });
});
