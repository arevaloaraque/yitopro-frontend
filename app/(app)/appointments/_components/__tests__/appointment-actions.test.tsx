/**
 * AppointmentActions — las citas pasadas son de solo lectura.
 *
 * La regla vive junto a `canCancel`/`canReschedule`: `scheduled` ya no basta,
 * la cita también debe no haber empezado (`isPastAppointment`). Con nada que
 * cambiar, el menú "…" colapsa al botón de historial que ya existía.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Appointment } from "@/lib/types";

import { AppointmentActions } from "../appointment-actions";

const base = {
  id: "apt-1",
  service_id: "svc-1",
  professional_id: "pro-1",
  customer_id: "cust-1",
  customer_name: "Ana Díaz",
  status: "scheduled",
  created_by: "human",
  notes: null,
} as Appointment;

function future(): Appointment {
  return {
    ...base,
    start: "2099-08-05T14:00:00-04:00",
    end: "2099-08-05T15:00:00-04:00",
  };
}

function past(): Appointment {
  return {
    ...base,
    start: "2026-07-01T14:00:00-04:00",
    end: "2026-07-01T15:00:00-04:00",
  };
}

function renderActions(appointment: Appointment) {
  const handlers = {
    onCancel: vi.fn(),
    onReschedule: vi.fn(),
    onHistory: vi.fn(),
  };
  render(<AppointmentActions appointment={appointment} {...handlers} />);
  return handlers;
}

describe("AppointmentActions — citas pasadas", () => {
  it("una cita futura agendada ofrece el menú completo", async () => {
    const user = userEvent.setup();
    renderActions(future());

    await user.click(screen.getByRole("button", { name: "Acciones de la cita" }));

    expect(await screen.findByText("Reagendar")).toBeInTheDocument();
    expect(screen.getByText("Cancelar")).toBeInTheDocument();
    expect(screen.getByText("Historial")).toBeInTheDocument();
  });

  it("una cita pasada solo conserva el historial, sin menú", async () => {
    const user = userEvent.setup();
    const { onHistory } = renderActions(past());

    expect(
      screen.queryByRole("button", { name: "Acciones de la cita" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver historial" }));
    expect(onHistory).toHaveBeenCalledWith(past());
  });
});
