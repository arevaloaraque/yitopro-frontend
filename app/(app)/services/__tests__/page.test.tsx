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
import { searchServices, createService, updateService, deleteService } from "@/lib/api";

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

// El buscador vive en la URL (`useUrlFilters` → `useSearchParams`), que fuera del
// App Router no existe.
const { searchParamsStub } = vi.hoisted(() => ({
  searchParamsStub: { current: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsStub.current,
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
  searchParamsStub.current = new URLSearchParams();
  window.history.replaceState(null, "", "/services");
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

    await user.click(screen.getByRole("button", { name: "Editar servicio Baño" }));
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

    await user.click(screen.getByRole("switch", { name: "Desactivar servicio Baño" }));

    await waitFor(() =>
      expect(toastFns.success).toHaveBeenCalledWith("Servicio «Baño» desactivado"),
    );
  });

  // SVC-02: el backend acepta precio 0 (`Q(price__gte=0)`) y el wizard crea
  // servicios gratuitos. Con la validación `<= 0` anterior, corregirle el nombre
  // a uno de esos obligaba a inventarle un precio.
  it("guarda un servicio gratuito sin obligar a inventarle precio", async () => {
    const user = userEvent.setup();
    vi.mocked(searchServices).mockResolvedValue({
      items: [makeService({ name: "Consulta previa", price: 0 })],
      count: 1,
    });
    vi.mocked(updateService).mockResolvedValue(
      makeService({ name: "Consulta previa gratis", price: 0 }),
    );

    render(<ServicesPage />);
    expect(await screen.findByText("Consulta previa")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Editar servicio Consulta previa" }),
    );
    await user.type(screen.getByLabelText("Nombre"), " gratis");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() =>
      expect(updateService).toHaveBeenCalledWith("svc-1", {
        name: "Consulta previa gratis",
        description: "",
        duration_minutes: 45,
        price: 0,
      }),
    );
  });
});

describe("ServicesPage — eliminar servicio (SERVICIOS-04, SVC-10)", () => {
  it("elimina tras confirmar en el diálogo y muestra toast", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteService).mockResolvedValue(undefined);

    render(<ServicesPage />);
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar servicio Baño" }));
    await user.click(await screen.findByRole("button", { name: /sí, eliminar/i }));

    await waitFor(() => expect(deleteService).toHaveBeenCalledWith("svc-1"));
    expect(toastFns.success).toHaveBeenCalledWith("Servicio «Baño» eliminado");
    await waitFor(() => expect(screen.queryByText("Baño")).not.toBeInTheDocument());
  });

  it("no elimina si se vuelve atrás desde el diálogo", async () => {
    const user = userEvent.setup();

    render(<ServicesPage />);
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar servicio Baño" }));
    await user.click(await screen.findByRole("button", { name: /volver/i }));

    expect(deleteService).not.toHaveBeenCalled();
  });

  it("muestra el mensaje del backend en 409", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteService).mockRejectedValue(
      new Error("No se puede eliminar: el servicio tiene citas asociadas."),
    );

    render(<ServicesPage />);
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar servicio Baño" }));
    await user.click(await screen.findByRole("button", { name: /sí, eliminar/i }));

    await waitFor(() =>
      expect(toastFns.error).toHaveBeenCalledWith(
        "No se puede eliminar: el servicio tiene citas asociadas.",
      ),
    );
    // La fila sigue: el borrado optimista solo ocurre tras el éxito.
    expect(screen.getByText("Baño")).toBeInTheDocument();
  });
});

describe("ServicesPage — buscador en la URL (SVC-08)", () => {
  it("siembra el término desde la URL en la primera consulta", async () => {
    searchParamsStub.current = new URLSearchParams("q=corte");

    render(<ServicesPage />);

    await waitFor(() =>
      expect(searchServices).toHaveBeenCalledWith({
        search: "corte",
        limit: 20,
        offset: 0,
      }),
    );
    expect(screen.getByLabelText("Buscar")).toHaveValue("corte");
  });

  it("escribe el término retrasado en la URL y consulta una sola vez", async () => {
    const user = userEvent.setup();

    render(<ServicesPage />);
    await waitFor(() => expect(searchServices).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText("Buscar"), "baño");

    await waitFor(() => expect(window.location.search).toBe("?q=ba%C3%B1o"));
    // Cuatro pulsaciones, una sola consulta más: el debounce está sobre el valor.
    expect(searchServices).toHaveBeenCalledTimes(2);
    expect(searchServices).toHaveBeenLastCalledWith({
      search: "baño",
      limit: 20,
      offset: 0,
    });
  });
});

describe("ServicesPage — filtro de estado", () => {
  it("siembra el estado desde la URL y lo manda al servidor", async () => {
    searchParamsStub.current = new URLSearchParams("active=false");

    render(<ServicesPage />);

    await waitFor(() =>
      expect(searchServices).toHaveBeenCalledWith(
        expect.objectContaining({ active: false, offset: 0 }),
      ),
    );
    expect(screen.getByLabelText("Estado")).toHaveTextContent("Inactivos");
  });

  it("«Todos» no es un filtro: no manda el param", async () => {
    render(<ServicesPage />);

    await waitFor(() => expect(searchServices).toHaveBeenCalled());
    expect(searchServices).toHaveBeenCalledWith(
      expect.objectContaining({ active: undefined }),
    );
  });

  it("elegir «Activos» consulta de nuevo desde la primera página y queda en la URL", async () => {
    const user = userEvent.setup();
    render(<ServicesPage />);
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Estado"));
    await user.click(await screen.findByRole("option", { name: "Activos" }));

    await waitFor(() =>
      expect(searchServices).toHaveBeenLastCalledWith(
        expect.objectContaining({ active: true, offset: 0 }),
      ),
    );
    expect(new URLSearchParams(window.location.search).get("active")).toBe("true");
  });

  it("el refresco por SSE conserva el filtro, o metería inactivos en «Activos»", async () => {
    searchParamsStub.current = new URLSearchParams("active=true");
    render(<ServicesPage />);
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    emitSse({
      id: "e2",
      type: "servicio_actualizado",
      emitted_at: "2026-08-08T10:00:00Z",
      data: { service_id: "svc-1", active: true },
    } as SSEEvent);

    await waitFor(() => expect(searchServices).toHaveBeenCalledTimes(2));
    expect(searchServices).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: true }),
    );
  });

  it("cero filas con solo el estado puesto ofrece limpiar, sin citar un término vacío", async () => {
    const user = userEvent.setup();
    vi.mocked(searchServices).mockResolvedValue({ items: [], count: 0 });
    searchParamsStub.current = new URLSearchParams("active=false");

    render(<ServicesPage />);

    expect(await screen.findByText("Sin resultados")).toBeInTheDocument();
    expect(
      screen.getByText("Ningún servicio coincide con estos filtros."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    await waitFor(() =>
      expect(searchServices).toHaveBeenLastCalledWith(
        expect.objectContaining({ active: undefined, search: "" }),
      ),
    );
    expect(window.location.search).toBe("");
  });
});

describe("ServicesPage — fallo al cargar más (SVC-03)", () => {
  it("avisa con un toast y deja las filas ya cargadas en pantalla", async () => {
    const user = userEvent.setup();
    vi.mocked(searchServices).mockResolvedValue({
      items: [makeService()],
      count: 3,
    });

    render(<ServicesPage />);
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    vi.mocked(searchServices).mockRejectedValueOnce(new Error("La red falló"));
    await user.click(screen.getByRole("button", { name: /cargar más/i }));

    await waitFor(() => expect(toastFns.error).toHaveBeenCalledWith("La red falló"));
    expect(screen.getByText("Baño")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reintentar/i }),
    ).not.toBeInTheDocument();
  });
});
