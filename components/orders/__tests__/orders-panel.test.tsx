/**
 * OrdersPanel — the row identifies the order (number, origin, date), opens a detail
 * modal, and every action answers back: a spinner while it runs and a toast that names
 * what happened. Confirming patches the row instead of refetching, which is what keeps a
 * just-confirmed order on screen under the "Borrador" filter.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api";
import { listOrders, confirmOrder, cancelOrder } from "@/lib/api";
import { listConversations } from "@/lib/api/conversations";
import type { SSEEvent } from "@/lib/types";

import { OrdersPanel } from "../orders-panel";

vi.mock("@/lib/api");
// The detail modal lists the customer's conversations from this module (not the barrel).
vi.mock("@/lib/api/conversations");
// El filtro por cliente monta un `CustomerCombobox`, que pide su primera página al
// montar. MSW corre con `onUnhandledRequest: "error"`, así que esa llamada tiene que
// existir mockeada aunque ningún test de acá filtre por cliente.
vi.mock("@/lib/api/customers", () => ({
  searchCustomers: async () => ({ items: [], count: 0 }),
}));

// Los filtros viven en la URL: `useUrlFilters` lee `useSearchParams`, que fuera del
// App Router no existe.
const { searchParamsStub } = vi.hoisted(() => ({
  searchParamsStub: { current: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsStub.current,
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

const refreshPendingCount = vi.fn();
vi.mock("@/lib/orders", () => ({
  usePendingOrders: () => ({ pendingCount: 0, refresh: refreshPendingCount }),
}));

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

function makeOrder(over: Partial<Order> = {}): Order {
  return {
    id: "ord-1",
    customer: "Ana",
    customer_id: "c1",
    customer_phone: "+56911112222",
    customer_email: "",
    items: [
      {
        product_id: "p1",
        product_name: "Croquetas",
        quantity: 2,
        unit_price: 15,
        subtotal: 30,
        product_price: 15,
        product_stock: 8,
      },
    ],
    total: 33,
    status: "draft",
    created_by_ai: true,
    created_at: "2026-07-13T10:00:00Z",
    updated_at: "2026-07-13T10:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.length = 0;
  searchParamsStub.current = new URLSearchParams();
  window.history.replaceState(null, "", "/");
  // jsdom no implementa `print` (llamarlo tira "Not implemented"); acá interesa QUÉ se manda
  // a imprimir, no el diálogo del navegador.
  vi.stubGlobal("print", vi.fn());
  // `listOrders` devuelve el sobre paginado `{items, count}`: el `count` es el total
  // del tenant, y es lo que el pie imprime en vez del tope de red inventado.
  vi.mocked(listOrders).mockResolvedValue({ items: [makeOrder()], count: 1 });
  vi.mocked(confirmOrder).mockResolvedValue(makeOrder({ status: "confirmed" }));
  vi.mocked(cancelOrder).mockResolvedValue(makeOrder({ status: "cancelled" }));
  // El inbox se pagina por cursor: el mock devuelve el sobre, no el array.
  vi.mocked(listConversations).mockResolvedValue({
    items: [],
    next_cursor: "",
    has_more: false,
  });
});

describe("OrdersPanel — la fila identifica el pedido", () => {
  it("identifica el pedido y su estado, sin listar el contenido", async () => {
    render(<OrdersPanel />);
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Borrador")).toBeInTheDocument();
    // Los ítems son el CONTENIDO del pedido y se leen en el detalle. En la lista eran una
    // string concatenada y truncada a 24rem, con el resto solo accesible por el tooltip
    // nativo — invisible en touch — que además ocupaba la columna más ancha de la fila.
    expect(screen.queryByText(/Croquetas/)).not.toBeInTheDocument();
  });

  it("muestra número de pedido y de dónde vino", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    // El número era invisible: se usaba de `key` y nada más, así que no había forma de
    // nombrar un pedido. Y el origen lo promete el subtítulo del módulo.
    expect(screen.getByText("#ord-1")).toBeInTheDocument();
    expect(screen.getByText("Asistente")).toBeInTheDocument();
  });

  it("distingue un pedido hecho en el panel de uno del asistente", async () => {
    vi.mocked(listOrders).mockResolvedValue({
      items: [makeOrder({ created_by_ai: false })],
      count: 1,
    });
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    expect(screen.getByText("Panel")).toBeInTheDocument();
  });
});

describe("OrdersPanel — abrir el detalle", () => {
  it("el número es un botón alcanzable por teclado que abre el detalle", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    // La fila NO es un `role="button"`: tiene botones dentro y anidar controles rompe la
    // lectura por lector de pantalla. El foco de teclado vive en la celda del número.
    const trigger = screen.getByRole("button", {
      name: "Ver detalle del pedido ord-1",
    });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("Pedido #ord-1")).toBeInTheDocument();
  });

  it("al cerrar, el foco vuelve al control que lo abrió", async () => {
    // El repo ya se comió este bug una vez (ver lib/a11y/use-inert-background): si el
    // popup sale del árbol antes de que Base UI devuelva el foco, el teclado queda en
    // <body> sin camino de vuelta.
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    const trigger = screen.getByRole("button", {
      name: "Ver detalle del pedido ord-1",
    });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByText("Pedido #ord-1");

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByText("Pedido #ord-1")).not.toBeInTheDocument(),
    );
    expect(document.activeElement).toBe(trigger);
  });

  it("un pedido confirmado sigue mostrando sus líneas", async () => {
    // La regresión que motivó todo esto: la tabla de líneas vivía SOLO en el diálogo de
    // edición, que abre únicamente en borrador, así que confirmar volvía el contenido
    // del pedido inalcanzable para siempre.
    vi.mocked(listOrders).mockResolvedValue({
      items: [makeOrder({ status: "confirmed" })],
      count: 1,
    });
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Ver detalle del pedido ord-1" }),
    );
    await screen.findByText("Pedido #ord-1");
    // El nombre del producto y su subtotal solo existen acá: la lista no lleva ítems.
    expect(screen.getByText("Croquetas")).toBeInTheDocument();
    expect(screen.getByText("$30")).toBeInTheDocument();
  });
});

describe("OrdersPanel — confirmar responde algo", () => {
  it("confirming a draft calls the API and refreshes the badge count", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar pedido ord-1" }),
    );
    await waitFor(() => expect(confirmOrder).toHaveBeenCalledWith("ord-1"));
    expect(refreshPendingCount).toHaveBeenCalled();
  });

  it("avisa qué pedido se confirmó y por cuánto", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar pedido ord-1" }),
    );
    // Antes el valor de retorno de confirmOrder se descartaba y no había ningún mensaje:
    // solo desaparecían los botones de la fila.
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const [message, options] = toastSuccess.mock.calls[0];
    expect(message).toContain("#ord-1");
    expect(message).toContain("33");
    expect(options.description).toMatch(/stock/i);
  });

  it("la fila queda con su estado nuevo sin refetchear la lista", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar pedido ord-1" }),
    );
    await waitFor(() => expect(screen.getByText("Confirmado")).toBeInTheDocument());
    // Un refetch pediría `status=draft` con el filtro «Borrador» puesto, el pedido ya no
    // calificaría y la fila se evaporaría: una acción exitosa idéntica a un fallo. Patchear
    // con la respuesta del servidor es lo que lo evita.
    expect(listOrders).toHaveBeenCalledTimes(1);
  });

  it("muestra progreso mientras el servidor trabaja", async () => {
    let release: (o: Order) => void = () => {};
    vi.mocked(confirmOrder).mockReturnValue(
      new Promise<Order>((resolve) => {
        release = resolve;
      }),
    );
    const { container } = render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar pedido ord-1" }),
    );
    // Confirmar toma row locks y escribe inventario: pasa de los 300 ms con facilidad, y
    // «el botón se pone gris» no es una respuesta.
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    release(makeOrder({ status: "confirmed" }));
    await waitFor(() => expect(container.querySelector(".animate-spin")).toBeNull());
  });

  it("el 409 de stock llega al operador con el motivo del backend", async () => {
    vi.mocked(confirmOrder).mockRejectedValue(
      new Error(
        'Stock insuficiente para "Croquetas": quedan 1 y el pedido necesita 2.',
      ),
    );
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar pedido ord-1" }),
    );
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain("Croquetas");
  });
});

describe("OrdersPanel — cancelar pide confirmación", () => {
  it("no llama a la API hasta que se acepta el diálogo", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Cancelar pedido ord-1" }),
    );
    // El diálogo nombra el pedido; antes el PATCH salía en el primer click.
    expect(await screen.findByText("¿Cancelar el pedido #ord-1?")).toBeInTheDocument();
    expect(cancelOrder).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() =>
      expect(screen.queryByText("¿Cancelar el pedido #ord-1?")).not.toBeInTheDocument(),
    );
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it("al aceptar cancela y refresca el contador", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Cancelar pedido ord-1" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    await waitFor(() => expect(cancelOrder).toHaveBeenCalledWith("ord-1"));
    expect(refreshPendingCount).toHaveBeenCalled();
    expect(toastSuccess.mock.calls[0][0]).toContain("#ord-1");
  });
});

describe("OrdersPanel — imprimir", () => {
  it("ofrece imprimir en TODAS las filas, no solo en los borradores", async () => {
    // La celda de acciones quedaba vacía en confirmados y cancelados. Imprimir es la única
    // acción que aplica a cualquier estado, así que es la que le da sentido a la columna.
    for (const status of ["draft", "confirmed", "cancelled"] as const) {
      vi.mocked(listOrders).mockResolvedValue({
        items: [makeOrder({ status })],
        count: 1,
      });
      const { unmount } = render(<OrdersPanel />);
      await screen.findByText("Ana");
      expect(
        screen.getByRole("button", { name: "Imprimir pedido ord-1" }),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("el comprobante trae las seis filas pedidas, en orden", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Imprimir pedido ord-1" }),
    );

    const hoja = document.getElementById("order-print-root");
    expect(hoja).not.toBeNull();
    const texto = hoja!.textContent ?? "";
    // 1 cabecera del negocio · 2 cliente · 3 número · 4 estado · 5 ítems · 6 total.
    // Se afirma el ORDEN, no solo la presencia: un comprobante con el total antes de las
    // líneas tendría todos los datos y seguiría estando mal.
    const orden = ["Cliente", "Teléfono", "Pedido", "Estado", "Producto", "Total"];
    let cursor = -1;
    for (const etiqueta of orden) {
      const i = texto.indexOf(etiqueta);
      expect(i, `falta o está fuera de orden: ${etiqueta}`).toBeGreaterThan(cursor);
      cursor = i;
    }
    expect(texto).toContain("N.º ord-1");
    expect(texto).toContain("Borrador");
    await waitFor(() => expect(window.print).toHaveBeenCalled());
  });

  it("cada ítem lleva nombre, cantidad, precio unitario y subtotal", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Imprimir pedido ord-1" }),
    );

    const fila = document
      .getElementById("order-print-root")!
      .querySelector("tbody tr")!;
    const celdas = [...fila.querySelectorAll("td")].map((c) => c.textContent);
    expect(celdas).toEqual(["Croquetas", "2", "$15", "$30"]);
  });

  it("el total va alineado a la derecha", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Imprimir pedido ord-1" }),
    );

    const hoja = document.getElementById("order-print-root")!;
    const total = [...hoja.querySelectorAll("div")].find(
      (d) => d.textContent === "Total$33",
    );
    expect(total, "no se encontró la fila del total").toBeTruthy();
    expect(total!.className).toContain("justify-end");
  });

  it("es texto plano: sin conversaciones, sin enlaces y sin distintivos de color", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Imprimir pedido ord-1" }),
    );

    const hoja = document.getElementById("order-print-root")!;
    // Las conversaciones son del cliente, no del pedido, y en papel no se pueden abrir.
    expect(hoja.textContent).not.toContain("Conversaciones");
    // Un `tel:` impreso no llama a nadie; el dato tiene que estar, el enlace no.
    expect(hoja.querySelector("a")).toBeNull();
    expect(hoja.textContent).toContain("+56 9 1111 2222");
    // El estado va como palabra, no como distintivo (los badges llevan `rounded-full`).
    expect(hoja.querySelector(".rounded-full")).toBeNull();
    expect(hoja.className).toContain("font-mono");
  });

  it("no se ve en pantalla y se desmonta al terminar", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Imprimir pedido ord-1" }),
    );
    // Oculta en pantalla; `@media print` es lo que la revela (jsdom no evalúa media queries,
    // así que lo que se puede afirmar acá es la clase).
    expect(document.getElementById("order-print-root")).toHaveClass("hidden");

    // `afterprint` cubre imprimir Y cancelar: sin eso la hoja quedaría montada y el segundo
    // click en la misma fila no volvería a disparar el efecto.
    window.dispatchEvent(new Event("afterprint"));
    await waitFor(() => expect(document.getElementById("order-print-root")).toBeNull());
  });

  it("imprimir no abre el detalle de la fila", async () => {
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Imprimir pedido ord-1" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("OrdersPanel — paginación real", () => {
  it("el pie cuenta con el total del servidor, no con el tope de red", async () => {
    // El pie decía «Mostrando 20 de 500», y ese 500 era el `limit` que la propia capa
    // de red se inventaba: no era el total del tenant, así que el número mentía
    // siempre, y a partir de la fila 501 los pedidos no existían.
    vi.mocked(listOrders).mockResolvedValue({
      items: [makeOrder(), makeOrder({ id: "ord-2", customer: "Bruno" })],
      count: 137,
    });
    render(<OrdersPanel />);
    expect(await screen.findByText("Mostrando 2 de 137")).toBeInTheDocument();
  });

  it("«Cargar más» pide la página siguiente por offset y la agrega", async () => {
    vi.mocked(listOrders).mockResolvedValue({ items: [makeOrder()], count: 2 });
    render(<OrdersPanel />);
    await screen.findByText("Ana");

    vi.mocked(listOrders).mockResolvedValue({
      items: [makeOrder({ id: "ord-2", customer: "Bruno" })],
      count: 2,
    });
    await userEvent.click(screen.getByRole("button", { name: "Cargar más" }));

    expect(await screen.findByText("Bruno")).toBeInTheDocument();
    // Se AGREGA: antes esto era un slice en memoria sobre una única descarga.
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(vi.mocked(listOrders).mock.calls[1][1]).toMatchObject({
      offset: 1,
      limit: 20,
    });
  });

  it("el refresco por SSE se acota a lo que hay en pantalla", async () => {
    // Antes cada transición de CUALQUIER pedido del negocio se bajaba 500 filas, y la
    // IA crea borradores por WhatsApp sin que nadie toque el panel.
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    emitSse({
      id: "e9",
      type: "pedido_borrador_creado",
      emitted_at: "2026-07-13T10:08:00Z",
      data: { order_id: "2", total: "10", customer_id: "1" },
    } as SSEEvent);

    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
    expect(vi.mocked(listOrders).mock.calls[1][1]).toMatchObject({
      offset: 0,
      limit: 20,
    });
  });
});

describe("OrdersPanel — filtros", () => {
  it("un filtro de la URL se aplica a la consulta del servidor", async () => {
    // La vista filtrada se comparte por chat y sobrevive un reload; y el filtro por
    // cliente existía entero en el backend y en `lib/api` menos el control.
    searchParamsStub.current = new URLSearchParams("status=draft&customer=c1");
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    expect(vi.mocked(listOrders).mock.calls[0]).toEqual([
      "draft",
      { customer_id: "c1", limit: 20, offset: 0 },
    ]);
  });

  it("con filtro puesto, el vacío dice que es del filtro y ofrece limpiarlo", async () => {
    searchParamsStub.current = new URLSearchParams("status=cancelled");
    vi.mocked(listOrders).mockResolvedValue({ items: [], count: 0 });
    render(<OrdersPanel />);

    // «Sin pedidos» acá sería falso —los hay, el filtro no los alcanza— y sin salida
    // el operador tiene que adivinar por qué la tabla está vacía.
    expect(await screen.findByText("Sin resultados")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    await waitFor(() => expect(screen.getByText("Sin pedidos")).toBeInTheDocument());
  });
});

describe("OrdersPanel — tiempo real", () => {
  it("refetches the list on a pedido SSE event", async () => {
    render(<OrdersPanel />);
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));
    emitSse({
      id: "e1",
      type: "pedido_borrador_creado",
      emitted_at: "2026-07-13T10:01:00Z",
      data: { order_id: "2", total: "10", customer_id: "1" },
    } as SSEEvent);
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
  });

  it("refetches the list when a draft is modified (pedido_borrador_actualizado)", async () => {
    render(<OrdersPanel />);
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));
    emitSse({
      id: "e2",
      type: "pedido_borrador_actualizado",
      emitted_at: "2026-07-13T10:02:00Z",
      data: { order_id: "2", total: "20", customer_id: "1" },
    } as SSEEvent);
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
  });

  it("el eco de mi propia confirmación NO refetchea la lista", async () => {
    // Medido en vivo: confirmar mostraba el toast correcto y la fila se evaporaba igual.
    // `confirm_order` publica `pedido_creado` de vuelta, este handler refetcheaba con el
    // filtro activo, el pedido ya no era borrador y la fila desaparecía — o sea que el
    // tiempo real deshacía el patch que existe para evitar exactamente eso.
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar pedido ord-1" }),
    );
    await waitFor(() => expect(screen.getByText("Confirmado")).toBeInTheDocument());

    emitSse({
      id: "e4",
      type: "pedido_creado",
      emitted_at: "2026-07-13T10:04:00Z",
      data: { order_id: "ord-1", total: "33", customer_id: "c1" },
    } as SSEEvent);

    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
  });

  it("descarta el eco incluso si llega ANTES de la respuesta del PATCH", async () => {
    // Este es el caso real: el backend publica post-commit, así que el evento le gana la
    // carrera a la respuesta HTTP (medido en vivo — el refetch salió antes de nuestro
    // propio `pending-count`). Marcar el pedido al recibir la respuesta llegaba tarde
    // siempre; hay que marcarlo al INICIAR la acción.
    let release: (o: Order) => void = () => {};
    vi.mocked(confirmOrder).mockReturnValue(
      new Promise<Order>((resolve) => {
        release = resolve;
      }),
    );
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar pedido ord-1" }),
    );

    emitSse({
      id: "e7",
      type: "pedido_creado",
      emitted_at: "2026-07-13T10:06:00Z",
      data: { order_id: "ord-1", total: "33", customer_id: "c1" },
    } as SSEEvent);

    release(makeOrder({ status: "confirmed" }));
    await waitFor(() => expect(screen.getByText("Confirmado")).toBeInTheDocument());
    expect(listOrders).toHaveBeenCalledTimes(1);
  });

  it("si el PATCH falla, el eco deja de descartarse", async () => {
    // Sin commit no hay evento, así que la marca tiene que soltarse o el próximo cambio
    // real de ese pedido se perdería una vez.
    vi.mocked(confirmOrder).mockRejectedValue(new Error("Stock insuficiente"));
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar pedido ord-1" }),
    );
    await waitFor(() => expect(toastError).toHaveBeenCalled());

    emitSse({
      id: "e8",
      type: "pedido_creado",
      emitted_at: "2026-07-13T10:07:00Z",
      data: { order_id: "ord-1", total: "33", customer_id: "c1" },
    } as SSEEvent);
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
  });

  it("pero un cambio POSTERIOR sobre el mismo pedido sí refetchea", async () => {
    // El descarte es de un solo uso: si otro operador toca ese pedido después, la lista
    // tiene que actualizarse igual que siempre.
    render(<OrdersPanel />);
    await screen.findByText("Ana");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar pedido ord-1" }),
    );
    await waitFor(() => expect(screen.getByText("Confirmado")).toBeInTheDocument());

    const echo = {
      id: "e5",
      type: "pedido_creado",
      emitted_at: "2026-07-13T10:05:00Z",
      data: { order_id: "ord-1", total: "33", customer_id: "c1" },
    } as SSEEvent;
    emitSse(echo); // el eco propio: se descarta
    emitSse({ ...echo, id: "e6" }); // el de alguien más: refetchea
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
  });

  it("refetches when another operator cancels an order", async () => {
    render(<OrdersPanel />);
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));
    // Cancellation used to emit no event at all, so a second panel kept a row that no
    // longer existed until someone reloaded.
    emitSse({
      id: "e3",
      type: "pedido_cancelado",
      emitted_at: "2026-07-13T10:03:00Z",
      data: { order_id: "2", total: "20", customer_id: "1" },
    } as SSEEvent);
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
  });
});
