/**
 * RescheduleDialog — el nuevo slot tampoco puede ser pasado.
 *
 * Defensa en profundidad: aunque la agenda ya esconde la acción sobre citas
 * empezadas, el diálogo puede quedar abierto mientras la hora corre, así que
 * el slot elegido se valida aquí igual que en CreateDialog.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Appointment } from "@/lib/types";

import { RescheduleDialog } from "../reschedule-dialog";

const appointment = {
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
} as Appointment;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function renderDialog(onReschedule = vi.fn()) {
  render(
    <RescheduleDialog
      open
      onOpenChange={() => {}}
      appointment={appointment}
      onReschedule={onReschedule}
    />,
  );
  return onReschedule;
}

function pick(date: string, time: string) {
  fireEvent.change(screen.getByLabelText("Nueva fecha"), { target: { value: date } });
  fireEvent.change(screen.getByLabelText("Nueva hora"), { target: { value: time } });
}

describe("RescheduleDialog — slots pasados", () => {
  it("rechaza una fecha pasada sin llamar al backend", async () => {
    const user = userEvent.setup();
    const onReschedule = renderDialog();

    pick("2020-01-01", "10:00");
    await user.click(screen.getByRole("button", { name: /reagendar/i }));

    expect(await screen.findByText("La fecha no puede ser pasada")).toBeInTheDocument();
    expect(onReschedule).not.toHaveBeenCalled();
  });

  it("rechaza una hora pasada de hoy", async () => {
    const user = userEvent.setup();
    const onReschedule = renderDialog();

    pick(todayStr(), "00:01");
    await user.click(screen.getByRole("button", { name: /reagendar/i }));

    expect(await screen.findByText("La hora no puede ser pasada")).toBeInTheDocument();
    expect(onReschedule).not.toHaveBeenCalled();
  });

  it("un slot futuro se envía conservando la duración", async () => {
    const user = userEvent.setup();
    const onReschedule = renderDialog(vi.fn().mockResolvedValue(undefined));

    pick("2099-12-31", "10:00");
    await user.click(screen.getByRole("button", { name: /reagendar/i }));

    expect(onReschedule).toHaveBeenCalledTimes(1);
    const [id, next] = onReschedule.mock.calls[0];
    expect(id).toBe("apt-1");
    expect(next.start).toContain("2099-12-31");
    expect(new Date(next.end).getTime() - new Date(next.start).getTime()).toBe(
      3_600_000,
    );
  });
});
