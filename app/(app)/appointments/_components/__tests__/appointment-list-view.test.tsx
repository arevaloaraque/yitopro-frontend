/**
 * AppointmentListView — la fila abre el detalle sin romper el <tbody>.
 *
 * Regresión: la primera versión envolvía la fila en PopoverTrigger, cuyo
 * focus-guard <span> quedaba como hijo ilegal de <tbody> y Next reportaba
 * un hydration error. Ahora la fila solo REPORTA el click y cede su elemento
 * como anchor de un popover controlado.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listPayments } from "@/lib/api/payments";

import { AppointmentListView } from "../appointment-list-view";
import type { EnrichedAppointment } from "../types";

vi.mock("@/lib/api/payments");

const appointment: EnrichedAppointment = {
  id: "apt-1",
  service_id: "svc-1",
  professional_id: "pro-1",
  customer_id: "cust-1",
  customer_name: "Ana Díaz",
  start: "2099-08-05T14:00:00-04:00",
  end: "2099-08-05T15:00:00-04:00",
  status: "scheduled",
  created_by: "human",
  notes: null,
  customerName: "Ana Díaz",
  serviceName: "Corte de pelo",
  professionalName: "Camila",
} as EnrichedAppointment;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPayments).mockResolvedValue({
    items: [],
    next_cursor: "",
    has_more: false,
  });
});

function renderList() {
  render(
    <AppointmentListView
      appointments={[appointment]}
      statusFilter="all"
      onCancel={vi.fn()}
      onReschedule={vi.fn()}
      onHistory={vi.fn()}
      onCreatePaymentLink={vi.fn()}
    />,
  );
}

describe("AppointmentListView — detalle al click", () => {
  it("abre la tarjeta de la cita al hacer click en la fila", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByText("Ana Díaz"));

    // La tarjeta muestra el detalle; el nombre ahora está dos veces: fila + tarjeta.
    expect(await screen.findAllByText("Ana Díaz")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Ver historial" })).toBeInTheDocument();
  });

  it("no deja focus-guards de Base UI dentro del tbody", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByText("Ana Díaz"));
    await screen.findAllByText("Ana Díaz");

    expect(
      document.querySelectorAll("tbody [data-base-ui-focus-guard]"),
    ).toHaveLength(0);
  });
});
