/**
 * Services page — live refresh on service-catalog SSE events.
 *
 * When another operator or the onboarding wizard creates/edits/deletes a
 * service, the list must refetch instead of going stale.
 *
 * F-6 also covers: success toasts on create/update/toggle, delete with
 * confirm (409 shows the backend message), the active switch and the
 * optional description in the create/edit dialog.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Service, SSEEvent } from "@/lib/types";
import {
  searchServices,
  createService,
  updateService,
  deleteService,
} from "@/lib/api";

import ServicesPage from "../page";

vi.mock("@/lib/api");

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

function makeService(over: Partial<Service> = {}): Service {
  return {
    id: "svc-1",
    name: "Baño",
    description: "",
    duration_minutes: 45,
    price: 12000,
    is_active: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.length = 0;
  vi.mocked(searchServices).mockResolvedValue({ items: [makeService()], count: 1 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ServicesPage — SSE freshness", () => {
  it.each([
    ["servicio_creado", { service_id: "svc-2", active: true }],
    ["servicio_actualizado", { service_id: "svc-1", active: false }],
    ["servicio_eliminado", { service_id: "svc-1" }],
  ])("refetches the list on %s", async (type, data) => {
    render(<ServicesPage />);
    await waitFor(() => expect(searchServices).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    emitSse({
      id: "e1",
      type,
      emitted_at: "2026-07-11T10:01:00Z",
      data,
    } as SSEEvent);

    await waitFor(() => expect(searchServices).toHaveBeenCalledTimes(2));
  });
});

describe("ServicesPage — crear servicio (SERVICIOS-02/05/06)", () => {
  it("crea con descripción y switch inactivo, y muestra toast con el nombre", async () => {
    const user = userEvent.setup();
    vi.mocked(createService).mockResolvedValue(
      makeService({ id: "svc-9", name: "Peinado", is_active: false }),
    );

    render(<ServicesPage />);
    await waitFor(() => expect(searchServices).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /nuevo servicio/i }));
    await user.type(screen.getByLabelText("Nombre"), "Peinado");
    await user.type(screen.getByLabelText("Duración (minutos)"), "30");
    await user.type(screen.getByLabelText("Precio"), "8000");
    await user.type(screen.getByLabelText("Descripción (opcional)"), "Con cepillado");
    await user.click(screen.getByRole("switch", { name: "Servicio activo" }));
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() =>
      expect(createService).toHaveBeenCalledWith({
        name: "Peinado",
        description: "Con cepillado",
        duration_minutes: 30,
        price: 8000,
        is_active: false,
      }),
    );
    expect(toastFns.success).toHaveBeenCalledWith("Servicio «Peinado» creado");
  });
});

describe("ServicesPage — editar servicio (SERVICIOS-03/06)", () => {
  it("envía la descripción y muestra toast de actualizado", async () => {
    const user = userEvent.setup();
    vi.mocked(updateService).mockResolvedValue(
      makeService({ description: "Solo baño" }),
    );

    render(<ServicesPage />);
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar servicio" }));
    await user.type(screen.getByLabelText("Descripción (opcional)"), "Solo baño");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(updateService).toHaveBeenCalledWith("svc-1", {
        name: "Baño",
        description: "Solo baño",
        duration_minutes: 45,
        price: 12000,
      }),
    );
    expect(toastFns.success).toHaveBeenCalledWith("Servicio «Baño» actualizado");
  });

  it("muestra toast al cambiar activo/inactivo desde la tabla", async () => {
    const user = userEvent.setup();
    vi.mocked(updateService).mockResolvedValue(makeService({ is_active: false }));

    render(<ServicesPage />);
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Desactivar servicio" }));

    await waitFor(() =>
      expect(toastFns.success).toHaveBeenCalledWith("Servicio «Baño» desactivado"),
    );
  });
});

describe("ServicesPage — eliminar servicio (SERVICIOS-04)", () => {
  it("elimina tras confirmar y muestra toast", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteService).mockResolvedValue(undefined);

    render(<ServicesPage />);
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar servicio" }));

    await waitFor(() => expect(deleteService).toHaveBeenCalledWith("svc-1"));
    expect(toastFns.success).toHaveBeenCalledWith("Servicio «Baño» eliminado");
    expect(screen.queryByText("Baño")).not.toBeInTheDocument();
  });

  it("no elimina si se cancela la confirmación", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ServicesPage />);
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar servicio" }));

    expect(deleteService).not.toHaveBeenCalled();
  });

  it("muestra el mensaje del backend en 409", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteService).mockRejectedValue(
      new Error("No se puede eliminar: el servicio tiene citas asociadas."),
    );

    render(<ServicesPage />);
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar servicio" }));

    await waitFor(() =>
      expect(toastFns.error).toHaveBeenCalledWith(
        "No se puede eliminar: el servicio tiene citas asociadas.",
      ),
    );
    // La fila sigue: el borrado optimista solo ocurre tras el éxito.
    expect(screen.getByText("Baño")).toBeInTheDocument();
  });
});
