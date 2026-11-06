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
  professional_ids: [],
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

describe("CreateDialog — profesionales por servicio (H4)", () => {
  const pros: Professional[] = [
    { id: "pro-1", name: "Camila", is_active: true },
    { id: "pro-2", name: "Diego", is_active: true },
    { id: "pro-3", name: "Rocío", is_active: true },
  ];
  const corte: Service = {
    ...service,
    id: "svc-2",
    name: "Corte",
    professional_ids: ["pro-2"],
  };

  function renderDialog() {
    return render(
      <CreateDialog
        open
        onOpenChange={() => {}}
        services={[service, corte]}
        professionals={pros}
        onCreate={vi.fn()}
      />,
    );
  }

  async function pick(
    user: ReturnType<typeof userEvent.setup>,
    label: string,
    option: string,
  ) {
    await user.click(screen.getByLabelText(label));
    await user.click(await screen.findByRole("option", { name: option }));
  }

  it("un servicio sin restricción ofrece a todos los profesionales activos", async () => {
    const user = userEvent.setup();
    renderDialog();
    await pick(user, "Servicio", "Baño (45 min)");

    await user.click(screen.getByLabelText("Profesional"));
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names).toEqual(["Cualquiera (automático)", "Camila", "Diego", "Rocío"]);
  });

  it("un servicio restringido ofrece solo a sus profesionales", async () => {
    const user = userEvent.setup();
    renderDialog();
    await pick(user, "Servicio", "Corte (45 min)");

    await user.click(screen.getByLabelText("Profesional"));
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names).toEqual(["Cualquiera (automático)", "Diego"]);
  });

  it("suelta un profesional ya elegido que no atiende el servicio nuevo", async () => {
    const user = userEvent.setup();
    renderDialog();
    await pick(user, "Profesional", "Camila");
    expect(screen.getByLabelText("Profesional")).toHaveTextContent("Camila");

    await pick(user, "Servicio", "Corte (45 min)");
    expect(screen.getByLabelText("Profesional")).toHaveTextContent(
      "Cualquiera (automático)",
    );
  });

  it("conserva al elegido si sí atiende el servicio nuevo", async () => {
    const user = userEvent.setup();
    renderDialog();
    await pick(user, "Profesional", "Diego");
    await pick(user, "Servicio", "Corte (45 min)");
    expect(screen.getByLabelText("Profesional")).toHaveTextContent("Diego");
  });
});
