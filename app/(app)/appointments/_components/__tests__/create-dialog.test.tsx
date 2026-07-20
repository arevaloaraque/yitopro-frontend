/**
 * CreateDialog (nueva cita) — validación accesible y limpieza de errores.
 *
 * AGENDA-03: corregir un campo elimina su error inline de inmediato.
 * A11Y-03: los errores se anuncian con role="alert" y marcan el campo
 * con aria-invalid / aria-describedby.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Professional, Service } from "@/lib/types";
import { searchCustomers } from "@/lib/api/customers";

import { CreateDialog } from "../create-dialog";

vi.mock("@/lib/api/customers");

const service: Service = {
  id: "svc-1",
  name: "Baño",
  description: "",
  duration_minutes: 45,
  price: 12000,
  is_active: true,
} as Service;

const professional: Professional = {
  id: "pro-1",
  name: "Camila",
  is_active: true,
} as Professional;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchCustomers).mockResolvedValue({ items: [], count: 0 });
});

describe("CreateDialog — errores de formulario", () => {
  it("muestra errores con role=alert y los limpia al corregir el campo", async () => {
    const user = userEvent.setup();
    render(
      <CreateDialog
        open
        onOpenChange={() => {}}
        services={[service]}
        professionals={[professional]}
        onCreate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /crear cita/i }));

    // Cliente, servicio, fecha y hora vacíos → 4 errores anunciados.
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(4);

    const dateInput = screen.getByLabelText("Fecha");
    expect(dateInput).toHaveAttribute("aria-invalid", "true");
    expect(dateInput).toHaveAttribute("aria-describedby", "create-date-error");

    // AGENDA-03: escribir una fecha elimina SOLO su error; el resto queda.
    await user.type(dateInput, "2099-12-31");
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    expect(dateInput).not.toHaveAttribute("aria-invalid");
    expect(document.getElementById("create-date-error")).toBeNull();
  });
});
