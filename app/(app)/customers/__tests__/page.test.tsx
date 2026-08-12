/**
 * Customers page — live refresh on customer-domain SSE events.
 *
 * When another operator (or the WhatsApp auto-create path) adds/edits a
 * customer, the list must refetch instead of going stale.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Customer, SSEEvent } from "@/lib/types";
import { createCustomer, searchCustomers } from "@/lib/api/customers";
import { listConversations } from "@/lib/api/conversations";

import CustomersPage from "../page";

vi.mock("@/lib/api/customers");
vi.mock("@/lib/api/conversations");
vi.mock("@/lib/api/records");

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

// The open drawer is seeded from `?id=` so other screens (the order detail) can link
// straight to a person. Mock useSearchParams so tests can drive that initial state.
const { searchParamsStub } = vi.hoisted(() => ({
  searchParamsStub: { current: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsStub.current,
}));

function emitSse(event: SSEEvent) {
  for (const handler of sseHandlers) handler(event);
}

function makeCustomer(over: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    name: "Ana",
    phone: "+56911111111",
    email: "",
    created_at: "2026-07-11T10:00:00Z",
    rating_avg: null,
    rating_count: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.length = 0;
  searchParamsStub.current = new URLSearchParams();
  // La página escribe sus filtros en la URL con `replaceState`: sin reiniciarla, un
  // test arrastra el `?q=` del anterior.
  window.history.replaceState(null, "", "/");
  // `listConversations` devuelve una PÁGINA (la bandeja pasó a cursor, sin `count`).
  // Aquí solo importa que esta pantalla NO la llame.
  vi.mocked(listConversations).mockResolvedValue({
    items: [],
    next_cursor: "",
    has_more: false,
  });
  vi.mocked(searchCustomers).mockResolvedValue({ items: [makeCustomer()], count: 1 });
});

describe("CustomersPage — SSE freshness", () => {
  it("refetches the list when a customer is created elsewhere", async () => {
    render(<CustomersPage />);
    // Initial load.
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));

    emitSse({
      id: "e1",
      type: "cliente_creado",
      emitted_at: "2026-07-11T10:01:00Z",
      data: { customer_id: "cust-2", origin: "whatsapp" },
    } as SSEEvent);

    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(2));
  });

  it("refetches the list when a customer is updated elsewhere", async () => {
    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Ana")).toBeInTheDocument();

    emitSse({
      id: "e2",
      type: "cliente_actualizado",
      emitted_at: "2026-07-11T10:01:00Z",
      data: { customer_id: "cust-1", fields: ["email"] },
    } as SSEEvent);

    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(2));
  });

  it("no descarga las conversaciones del negocio para pintar la lista (CLI-01)", async () => {
    // El badge de conteo se bajaba la tabla ENTERA de conversaciones para contar hilos
    // por cliente, y encima contaba mal con la lista paginada. El dato exacto lo da el
    // drawer con `listConversations({customerId})`; aquí no debe pedirse nada.
    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));

    emitSse({
      id: "m1",
      type: "mensaje_recibido",
      emitted_at: "2026-07-11T10:01:00Z",
      data: { conversation_id: "conv-1", message_id: "msg-1" },
    } as SSEEvent);

    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));
    expect(listConversations).not.toHaveBeenCalled();
  });

  it("el refetch por SSE no encoge la lista ya cargada (TRANS-04)", async () => {
    const user = userEvent.setup();
    vi.mocked(searchCustomers).mockImplementation(async (params = {}) => {
      const { offset = 0, limit = 20 } = params;
      return {
        items: Array.from({ length: Math.min(limit, 40 - offset) }, (_, i) =>
          makeCustomer({ id: `cust-${offset + i}`, name: `Cliente ${offset + i}` }),
        ),
        count: 45,
      };
    });

    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /cargar más/i }));
    await waitFor(() => expect(screen.getByText("Cliente 20")).toBeInTheDocument());

    emitSse({
      id: "e3",
      type: "cliente_actualizado",
      emitted_at: "2026-07-11T10:01:00Z",
      data: { customer_id: "cust-1", fields: ["email"] },
    } as SSEEvent);

    // Con `limit: PAGE_SIZE` fijo, las 40 filas cargadas volvían a ser 20 porque otro
    // operador tocó un cliente.
    await waitFor(() =>
      expect(vi.mocked(searchCustomers).mock.lastCall?.[0]).toMatchObject({
        offset: 0,
        limit: 40,
      }),
    );
  });
});

describe("CustomersPage — buscador en la URL (CLI-05)", () => {
  it("al escribir el filtro en la URL conserva el ?id= del drawer", async () => {
    // El `?id=` es contrato: lo escriben los toasts y el detalle de pedido. Un efecto
    // que reconstruyera los params desde cero cerraría la ficha abierta al arrancar
    // con un enlace filtrado.
    searchParamsStub.current = new URLSearchParams("q=ana&id=cust-1");
    window.history.replaceState(null, "", "/?q=ana&id=cust-1");

    render(<CustomersPage />);
    await waitFor(() =>
      expect(vi.mocked(searchCustomers).mock.lastCall?.[0]).toMatchObject({
        search: "ana",
      }),
    );

    const params = new URLSearchParams(window.location.search);
    expect(params.get("q")).toBe("ana");
    expect(params.get("id")).toBe("cust-1");
  });

  it("al abrir una ficha conserva el ?q= vigente", async () => {
    // La simétrica: `openCustomer` escribía `?id=…` a secas y se llevaba por delante
    // el filtro, así que la URL de una ficha abierta desde una lista filtrada ya no
    // reproducía lo que había en pantalla.
    const user = userEvent.setup();
    searchParamsStub.current = new URLSearchParams("q=ana");
    window.history.replaceState(null, "", "/?q=ana");

    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /ver datos de ana/i }));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("id")).toBe("cust-1");
    expect(params.get("q")).toBe("ana");
  });

  it("siembra el buscador desde ?q= y no lo deja en la URL al limpiarlo", async () => {
    const user = userEvent.setup();
    searchParamsStub.current = new URLSearchParams("q=ana");
    window.history.replaceState(null, "", "/?q=ana");

    render(<CustomersPage />);
    await waitFor(() =>
      expect(vi.mocked(searchCustomers).mock.lastCall?.[0]).toMatchObject({
        search: "ana",
      }),
    );

    await user.click(screen.getByRole("button", { name: /limpiar/i }));

    await waitFor(() => expect(window.location.search).toBe(""));
  });
});

/**
 * Orden y periodo los resuelve el SERVIDOR. Lo que estos tests defienden es que
 * la pantalla no vuelva a ordenar ni recortar sobre la página cargada: cada uno
 * comprueba que el parámetro sale hacia `lib/api/customers.ts`.
 */
describe("CustomersPage — orden del servidor", () => {
  it("arranca con el default del backend y no manda un orden inventado", async () => {
    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));
    expect(vi.mocked(searchCustomers).mock.calls[0]?.[0]).toMatchObject({
      ordering: "-created_at",
    });
  });

  it("manda el orden elegido al servidor y lo deja en la URL", async () => {
    const user = userEvent.setup();
    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("combobox", { name: /ordenar por/i }));
    await user.click(await screen.findByRole("option", { name: /peor calificados/i }));

    await waitFor(() =>
      expect(vi.mocked(searchCustomers).mock.lastCall?.[0]).toMatchObject({
        ordering: "rating_avg",
      }),
    );
    expect(new URLSearchParams(window.location.search).get("sort")).toBe("rating_avg");
  });

  it("un ?sort= inventado cae al default en vez de pedir un 422", async () => {
    // El `ordering` del backend es un enum cerrado: reenviar lo que traiga la URL
    // devolvía 422 y la pantalla entera se iba a estado de error por un parámetro
    // escrito a mano.
    searchParamsStub.current = new URLSearchParams("sort=lol");
    window.history.replaceState(null, "", "/?sort=lol");

    render(<CustomersPage />);
    await waitFor(() =>
      expect(vi.mocked(searchCustomers).mock.lastCall?.[0]).toMatchObject({
        ordering: "-created_at",
      }),
    );
  });

  it("al ordenar por calificación avisa que los sin calificar van al final", async () => {
    // El backend los deja al final EN LOS DOS SENTIDOS y su `rating_avg` viaja
    // null, nunca 0. Sin decirlo, «Peor calificados» se lee como si no tener nota
    // fuera la mejor nota.
    searchParamsStub.current = new URLSearchParams("sort=-rating_avg");
    window.history.replaceState(null, "", "/?sort=-rating_avg");

    render(<CustomersPage />);
    expect(await screen.findByText(/sin calificar van al final/i)).toBeInTheDocument();
  });

  it("«Cargar más» conserva el orden y el periodo", async () => {
    // Una segunda página pedida sin el `ordering` ni la ventana es la página 2 de
    // OTRA lista: filas repetidas y filas que nunca aparecen.
    const user = userEvent.setup();
    searchParamsStub.current = new URLSearchParams(
      "sort=display_name&from=2026-07-01&to=2026-07-31",
    );
    window.history.replaceState(
      null,
      "",
      "/?sort=display_name&from=2026-07-01&to=2026-07-31",
    );
    vi.mocked(searchCustomers).mockResolvedValue({
      items: [makeCustomer()],
      count: 45,
    });

    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /cargar más/i }));

    await waitFor(() =>
      expect(vi.mocked(searchCustomers).mock.lastCall?.[0]).toMatchObject({
        ordering: "display_name",
        createdFrom: "2026-07-01",
        createdTo: "2026-07-31",
        offset: 1,
      }),
    );
  });
});

describe("CustomersPage — periodo de creación", () => {
  it("siembra el periodo desde la URL y lo pasa como días de calendario", async () => {
    // La pantalla habla en DÍAS inclusivos; la ventana semiabierta (cota superior
    // exclusiva) la arma `lib/api/customers.ts`, no el componente.
    searchParamsStub.current = new URLSearchParams("from=2026-07-01&to=2026-07-31");
    window.history.replaceState(null, "", "/?from=2026-07-01&to=2026-07-31");

    render(<CustomersPage />);
    await waitFor(() =>
      expect(vi.mocked(searchCustomers).mock.lastCall?.[0]).toMatchObject({
        createdFrom: "2026-07-01",
        createdTo: "2026-07-31",
      }),
    );
  });

  it("cada fecha vale sola y viaja a la URL", async () => {
    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Creado desde"), {
      target: { value: "2026-08-01" },
    });

    await waitFor(() =>
      expect(vi.mocked(searchCustomers).mock.lastCall?.[0]).toMatchObject({
        createdFrom: "2026-08-01",
        createdTo: undefined,
      }),
    );
    expect(new URLSearchParams(window.location.search).get("from")).toBe("2026-08-01");
  });

  it("un rango invertido no se aplica y lo dice", async () => {
    // Mandarlo al revés devuelve cero filas, que se lee como «este negocio no
    // tiene clientes» en vez de «esas dos fechas están al revés».
    searchParamsStub.current = new URLSearchParams("from=2026-08-10&to=2026-08-01");
    window.history.replaceState(null, "", "/?from=2026-08-10&to=2026-08-01");

    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));

    const sent = vi.mocked(searchCustomers).mock.lastCall?.[0];
    expect(sent?.createdFrom).toBeUndefined();
    expect(sent?.createdTo).toBeUndefined();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /fecha final es anterior a la inicial/i,
    );
  });

  it("distingue «no hay clientes» de «el periodo no encontró nada»", async () => {
    const user = userEvent.setup();
    vi.mocked(searchCustomers).mockResolvedValue({ items: [], count: 0 });
    searchParamsStub.current = new URLSearchParams("from=2026-07-01&to=2026-07-31");
    window.history.replaceState(null, "", "/?from=2026-07-01&to=2026-07-31");

    render(<CustomersPage />);
    // Nombra el periodo: un «no hay clientes» pelado con un rango olvidado arriba
    // es exactamente la pantalla que se reporta como rota.
    expect(
      await screen.findByText(/entre el 2026-07-01 y el 2026-07-31/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Agrega tu primer cliente/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /limpiar filtros/i }));
    await waitFor(() => expect(window.location.search).toBe(""));
  });
});

describe("CustomersPage — crear cliente", () => {
  it("muestra toast de éxito al crear un cliente nuevo (A11Y-04)", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({
      customer: makeCustomer({ id: "cust-9", name: "Pedro" }),
      created: true,
    });

    render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /nuevo cliente/i }));
    await user.type(screen.getByLabelText("Nombre"), "Pedro");
    await user.type(screen.getByLabelText("Teléfono"), "+56922222222");
    await user.click(screen.getByRole("button", { name: /^crear$/i }));

    await waitFor(() =>
      expect(toastFns.success).toHaveBeenCalledWith("Cliente creado"),
    );
  });
});

describe("CustomersPage — deep-link ?id=", () => {
  it("abre el detalle del cliente indicado en la URL", async () => {
    // Es lo que hace utilizable el link «ver cliente» del detalle de un pedido: sin esto
    // el operador cae en la lista y tiene que buscar a la persona a mano.
    searchParamsStub.current = new URLSearchParams("id=cust-1");
    const { container } = render(<CustomersPage />);
    await waitFor(() =>
      expect(
        container.ownerDocument.querySelector('[data-slot="sheet-content"]'),
      ).not.toBeNull(),
    );
  });

  it("sin ?id= no abre nada", async () => {
    const { container } = render(<CustomersPage />);
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledTimes(1));
    expect(
      container.ownerDocument.querySelector('[data-slot="sheet-content"]'),
    ).toBeNull();
  });
});
