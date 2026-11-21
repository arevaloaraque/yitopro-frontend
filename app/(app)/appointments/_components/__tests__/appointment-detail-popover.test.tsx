/**
 * AppointmentDetailPopover — la tarjeta de detalle estilo Google Calendar.
 *
 * Un click sobre la cita (calendario o lista) abre la tarjeta anclada al
 * evento: datos de la cita, acciones, y la sección de pago que decide entre
 * "Pagado" y "Crear link de pago" con UNA consulta acotada por appointment_id.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listPayments } from "@/lib/api/payments";
import type { SSEEvent } from "@/lib/types";

import { AppointmentDetailPopover } from "../appointment-detail-popover";
import type { EnrichedAppointment } from "../types";

vi.mock("@/lib/api/payments");

// PaymentSection se suscribe al stream mientras el popover está abierto; el
// mock registra el handler para poder emitir eventos y verificar que al cerrar
// la suscripción se retira (el array queda vacío).
const { sseHandlers } = vi.hoisted(() => ({
  sseHandlers: [] as ((event: SSEEvent) => void)[],
}));
vi.mock("@/lib/sse", () => ({
  subscribeToEvents: (handler: (event: SSEEvent) => void) => {
    sseHandlers.push(handler);
    return () => {
      const i = sseHandlers.indexOf(handler);
      if (i >= 0) sseHandlers.splice(i, 1);
    };
  },
}));

function emitSse(event: SSEEvent) {
  act(() => {
    for (const handler of [...sseHandlers]) handler(event);
  });
}

// Relativas al reloj, no fijas: `canChange` depende de `isPastAppointment()`, así
// que una fecha literal "futura" caduca sola y el día que pasa se lleva por delante
// los botones de Reagendar y Cancelar — un fallo que se lee como regresión y no lo
// es. El test de «cita pasada» sí pasa su par explícito, porque una fecha del
// pasado no caduca.
const HOUR = 60 * 60 * 1000;
const appointment: EnrichedAppointment = {
  id: "apt-1",
  service_id: "svc-1",
  professional_id: "pro-1",
  customer_id: "cust-1",
  customer_name: "Ana Díaz",
  start: new Date(Date.now() + 24 * HOUR).toISOString(),
  end: new Date(Date.now() + 25 * HOUR).toISOString(),
  status: "scheduled",
  created_by: "ai",
  notes: "Primera visita",
  service_name: "Corte de pelo",
  service_price: 15000,
  customerName: "Ana Díaz",
  serviceName: "Corte de pelo",
  professionalName: "Camila",
} as EnrichedAppointment;

function noPayments() {
  vi.mocked(listPayments).mockResolvedValue({
    items: [],
    next_cursor: "",
    has_more: false,
  });
}

function renderPopover(overrides: Partial<EnrichedAppointment> = {}) {
  const apt = { ...appointment, ...overrides };
  const handlers = {
    onCancel: vi.fn(),
    onReschedule: vi.fn(),
    onHistory: vi.fn(),
    onCreatePaymentLink: vi.fn(),
  };
  render(
    <AppointmentDetailPopover
      appointment={apt}
      trigger={<div>evento</div>}
      {...handlers}
    />,
  );
  return { apt, ...handlers };
}

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.length = 0;
  noPayments();
});

const PAID_PAYMENT = {
  kind: "payment" as const,
  id: "7",
  reference: "YTO-1",
  status: "paid" as const,
  amount: 15000,
  currency: "CLP",
  created_at: "2026-08-20T10:00:00-04:00",
  paid_at: "2026-08-20T10:01:00-04:00",
  expires_at: "2026-08-21T10:00:00-04:00",
  customer_id: "cust-1",
  customer_name: "Ana Díaz",
  concept: "",
  method_label: "Tarjeta",
  provider_name: "ALPS JustPay",
  channel_name: "Transbank",
};

const PAGO_RECIBIDO: SSEEvent = {
  id: "e1",
  type: "pago_recibido",
  emitted_at: "2026-08-20T10:01:00Z",
  data: { payment_id: "7", amount: "15000", currency: "CLP", customer_id: "cust-1" },
} as SSEEvent;

describe("AppointmentDetailPopover", () => {
  it("abre la tarjeta con el detalle de la cita al hacer click", async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByText("evento"));

    expect(await screen.findByText("Ana Díaz")).toBeInTheDocument();
    expect(screen.getByText("Corte de pelo")).toBeInTheDocument();
    expect(screen.getByText("Camila")).toBeInTheDocument();
    expect(screen.getByText("Primera visita")).toBeInTheDocument();
    expect(screen.getByText("Agendada")).toBeInTheDocument();
    expect(screen.getByText("IA")).toBeInTheDocument();
    // La consulta de pago va acotada a ESTA cita, nunca a toda la historia.
    expect(listPayments).toHaveBeenCalledWith(
      { appointment_id: "apt-1" },
      { limit: 10 },
    );
  });

  it("muestra Pagado y no ofrece link cuando la cita ya tiene un pago", async () => {
    vi.mocked(listPayments).mockResolvedValue({
      items: [
        {
          kind: "payment",
          id: "7",
          reference: "YTO-1",
          status: "paid",
          amount: 15000,
          currency: "CLP",
          created_at: "2026-08-01T10:00:00-04:00",
          paid_at: "2026-08-01T10:01:00-04:00",
          expires_at: "2026-08-02T10:00:00-04:00",
          customer_id: "cust-1",
          customer_name: "Ana Díaz",
          concept: "",
          method_label: "Tarjeta",
          provider_name: "ALPS JustPay",
          channel_name: "Webpay",
        },
      ],
      next_cursor: "",
      has_more: false,
    });
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByText("evento"));

    expect(await screen.findByText("Pagado")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /crear link de pago/i }),
    ).not.toBeInTheDocument();
  });

  it("ofrece crear link de pago cuando la cita no está pagada", async () => {
    const user = userEvent.setup();
    const { apt, onCreatePaymentLink } = renderPopover();

    await user.click(screen.getByText("evento"));
    const button = await screen.findByRole("button", {
      name: /crear link de pago/i,
    });
    await user.click(button);

    expect(onCreatePaymentLink).toHaveBeenCalledWith(apt);
  });

  it("no ofrece cobrar una cita cancelada ni reagendarla", async () => {
    const user = userEvent.setup();
    renderPopover({ status: "cancelled" });

    await user.click(screen.getByText("evento"));
    expect(await screen.findByText("Cancelada")).toBeInTheDocument();
    // Espera a que la sección de pago resuelva antes de afirmar la ausencia.
    await waitFor(() =>
      expect(screen.queryByText("Consultando pago…")).not.toBeInTheDocument(),
    );

    expect(
      screen.queryByRole("button", { name: /crear link de pago/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reagendar" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancelar cita" }),
    ).not.toBeInTheDocument();
    // El historial aplica a cualquier estado.
    expect(screen.getByRole("button", { name: "Ver historial" })).toBeInTheDocument();
  });

  it("una cita pasada es de solo lectura: sin reagendar ni cancelar, pero sí cobrable", async () => {
    const user = userEvent.setup();
    renderPopover({
      start: "2026-07-01T14:00:00-04:00",
      end: "2026-07-01T15:00:00-04:00",
    });

    await user.click(screen.getByText("evento"));
    expect(await screen.findByText("Ana Díaz")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Reagendar" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancelar cita" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver historial" })).toBeInTheDocument();
    // Cobrar una cita ya prestada sigue siendo legítimo.
    expect(
      await screen.findByRole("button", { name: /crear link de pago/i }),
    ).toBeInTheDocument();
  });

  it("las acciones llaman a sus handlers con la cita", async () => {
    const user = userEvent.setup();
    const { apt, onReschedule, onCancel, onHistory } = renderPopover();

    await user.click(screen.getByText("evento"));
    await user.click(await screen.findByRole("button", { name: "Reagendar" }));
    expect(onReschedule).toHaveBeenCalledWith(apt);

    await user.click(screen.getByText("evento"));
    await user.click(await screen.findByRole("button", { name: "Cancelar cita" }));
    expect(onCancel).toHaveBeenCalledWith(apt);

    await user.click(screen.getByText("evento"));
    await user.click(await screen.findByRole("button", { name: "Ver historial" }));
    expect(onHistory).toHaveBeenCalledWith(apt);
  });
});

/** El estado de pago se mantiene vivo mientras la tarjeta está abierta: un pago
 * que se acredita ya no sigue diciendo «Pendiente» (auditoría 2026-08-20). El
 * payload no trae appointment_id, así que el diseño es re-consultar la propia
 * query acotada, no hacer matching. */
describe("AppointmentDetailPopover — pago en vivo", () => {
  it("re-consulta el pago cuando llega pago_recibido con la tarjeta abierta", async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByText("evento"));
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Crear link de pago/)).toBeInTheDocument();

    vi.mocked(listPayments).mockResolvedValue({
      items: [PAID_PAYMENT],
      next_cursor: "",
      has_more: false,
    });
    emitSse(PAGO_RECIBIDO);

    expect(await screen.findByText("Pagado")).toBeInTheDocument();
    expect(listPayments).toHaveBeenCalledTimes(2);
  });

  it("cerrada la tarjeta, la suscripción se retira y el evento no consulta nada", async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByText("evento"));
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(1));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(sseHandlers.length).toBe(0));

    emitSse(PAGO_RECIBIDO);
    expect(listPayments).toHaveBeenCalledTimes(1);
  });
});
