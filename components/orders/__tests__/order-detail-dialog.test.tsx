/**
 * OrderDetailDialog — el detalle que no existía. Lo que importa acá es que el operador pueda
 * responder «¿qué es este pedido?» y «¿qué pasa si lo confirmo?» antes de actuar, y que
 * pueda hacerlo también con un pedido ya confirmado.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api";
import { listConversations } from "@/lib/api/conversations";
import type { Conversation } from "@/lib/types";

import { OrderDetailDialog } from "../order-detail-dialog";

// Sin provider, `useMoney` cae a CLP, que es lo que se afirma abajo.
vi.mock("@/lib/business", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/business")>()),
  useBusinessOptional: () => null,
}));
vi.mock("@/lib/api/conversations");

function makeConversation(over: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    customer_id: "c1",
    customer_name: "Arévalo Araque",
    customer_phone: "+56982978937",
    status: "closed",
    active_agent: null,
    assignee_id: null,
    last_message_at: "2026-07-31T09:00:00Z",
    unread: 0,
    customer_rating: null,
    rating_status: "pending",
    customer_rating_avg: null,
    customer_rating_count: 0,
    last_message_preview: "",
    last_message_direction: "",
    last_message_sender_kind: "",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // El inbox se pagina por cursor: el mock devuelve el sobre, no el array.
  vi.mocked(listConversations).mockResolvedValue({
    items: [],
    next_cursor: "",
    has_more: false,
  });
});

function makeOrder(over: Partial<Order> = {}): Order {
  return {
    id: "42",
    customer: "Arévalo Araque",
    customer_id: "c1",
    customer_phone: "+56982978937",
    customer_email: "cliente@ejemplo.cl",
    items: [
      {
        product_id: "p1",
        product_name: "Cera y Pomada",
        quantity: 2,
        unit_price: 17000,
        subtotal: 34000,
        product_price: 17000,
        product_stock: 25,
      },
    ],
    total: 34000,
    status: "draft",
    created_by_ai: true,
    created_at: "2026-07-31T10:00:00Z",
    updated_at: "2026-07-31T10:00:00Z",
    ...over,
  };
}

function renderDrawer(order: Order | null = makeOrder()) {
  return render(
    <OrderDetailDialog
      order={order}
      onOpenChange={vi.fn()}
      onEdit={vi.fn()}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      pending={null}
    />,
  );
}

describe("OrderDetailDialog — qué contiene el pedido", () => {
  it("muestra el número, el cliente y las líneas con su subtotal y el total", async () => {
    renderDrawer();
    expect(await screen.findByText("Pedido #42")).toBeInTheDocument();
    expect(screen.getByText("Arévalo Araque")).toBeInTheDocument();
    expect(screen.getByText("Cera y Pomada")).toBeInTheDocument();
    // 2 × $17.000: el subtotal por línea lo calcula el backend, el panel no re-deriva plata.
    expect(screen.getAllByText("$34.000").length).toBeGreaterThan(0);
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("sigue mostrando las líneas de un pedido confirmado", async () => {
    // El diálogo de edición solo abre en borrador, así que hasta ahora confirmar dejaba el
    // contenido del pedido inalcanzable. Este es el caso que cierra ese agujero.
    renderDrawer(makeOrder({ status: "confirmed" }));
    expect(await screen.findByText("Cera y Pomada")).toBeInTheDocument();
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
  });

  it("dice de dónde vino el pedido con texto, no solo con color", async () => {
    renderDrawer();
    // Un operador que no distingue el ámbar del verde igual lee «Borrador» y «Asistente».
    expect(await screen.findByText("Borrador")).toBeInTheDocument();
    expect(screen.getByText("Asistente")).toBeInTheDocument();
  });

  it("enlaza al cliente para poder ver quién es", async () => {
    renderDrawer();
    const link = await screen.findByRole("link", { name: /Ver cliente/ });
    expect(link).toHaveAttribute("href", "/customers?id=c1");
  });
});

describe("OrderDetailDialog — cómo contactar al cliente", () => {
  it("muestra teléfono y email como enlaces accionables", async () => {
    renderDrawer();
    // Un pedido es algo por lo que hay que llamar (se acabó el stock, hay que coordinar
    // un retiro). Con solo el nombre el operador no tiene con qué.
    const tel = await screen.findByRole("link", { name: /\+56/ });
    expect(tel).toHaveAttribute("href", "tel:+56982978937");
    const mail = screen.getByRole("link", { name: "cliente@ejemplo.cl" });
    expect(mail).toHaveAttribute("href", "mailto:cliente@ejemplo.cl");
  });

  it("normaliza el teléfono guardado sin «+» al armar el tel:", async () => {
    // Los teléfonos reales vienen sin prefijo («56922591206», verificado contra la base de
    // Caribbean); un `tel:` sin `+` se marca como número local del país del dispositivo.
    renderDrawer(makeOrder({ customer_phone: "56922591206" }));
    const tel = await screen.findByRole("link", { name: /\+56/ });
    expect(tel).toHaveAttribute("href", "tel:+56922591206");
    expect(screen.getByText("+56 9 2259 1206")).toBeInTheDocument();
  });

  it("dice que no hay email en lugar de dejar el hueco", async () => {
    renderDrawer(makeOrder({ customer_email: "" }));
    expect(await screen.findByText("Sin email")).toBeInTheDocument();
  });

  it("con un cliente sin nombre muestra el teléfono formateado, no el crudo", async () => {
    // El backend cae al teléfono crudo en `customer_name` cuando no hay display_name; sin
    // esto el encabezado mostraba «+56982978937» sin formato como si fuera un nombre.
    renderDrawer(
      makeOrder({ customer: "+56982978937", customer_phone: "+56982978937" }),
    );
    await screen.findByText("Pedido #42");
    expect(screen.queryByText("+56982978937")).not.toBeInTheDocument();
    expect(screen.getAllByText("+56 9 8297 8937").length).toBeGreaterThan(0);
  });
});

describe("OrderDetailDialog — conversaciones del cliente", () => {
  it("lista las conversaciones y cada una abre su hilo en el inbox", async () => {
    vi.mocked(listConversations).mockResolvedValue({
      items: [makeConversation({ id: "conv-9", status: "closed" })],
      next_cursor: "",
      has_more: false,
    });
    renderDrawer();
    const link = await screen.findByRole("link", { name: /Cerrada/ });
    expect(link).toHaveAttribute("href", "/conversations?id=conv-9");
  });

  it("pide solo las conversaciones de ese cliente", async () => {
    renderDrawer();
    await waitFor(() =>
      expect(listConversations).toHaveBeenCalledWith({ customerId: "c1" }),
    );
  });

  it("dice que el pedido no vino por WhatsApp cuando no hay ninguna", async () => {
    renderDrawer();
    expect(await screen.findByText(/no vino por WhatsApp/)).toBeInTheDocument();
  });

  it("un fallo al cargarlas no rompe el detalle del pedido", async () => {
    vi.mocked(listConversations).mockRejectedValue(new Error("boom"));
    renderDrawer();
    expect(
      await screen.findByText("No se pudieron cargar las conversaciones."),
    ).toBeInTheDocument();
    // Lo que importa del drawer sigue en pantalla.
    expect(screen.getByText("Cera y Pomada")).toBeInTheDocument();
  });

  it("se titula «del cliente», no «del pedido»", async () => {
    // No hay FK Order→Conversation ni `order_id` en AILog: vincular un pedido con el chat
    // exacto que lo originó no es derivable, y el rótulo no puede insinuar que sí.
    renderDrawer();
    expect(await screen.findByText(/Conversaciones del cliente/)).toBeInTheDocument();
  });
});

describe("OrderDetailDialog — qué pasa si confirmo", () => {
  it("avisa que el stock no alcanza ANTES de confirmar", async () => {
    renderDrawer(
      makeOrder({
        items: [
          {
            product_id: "p1",
            product_name: "Cera y Pomada",
            quantity: 5,
            unit_price: 17000,
            subtotal: 85000,
            product_price: 17000,
            product_stock: 3,
          },
        ],
      }),
    );
    // Hoy el operador descubre el 409 después de hacer click; el dato del stock ya venía
    // en la misma query del pedido.
    expect(await screen.findByText("Quedan 3")).toBeInTheDocument();
    expect(screen.getByRole("alert").textContent).toMatch(/se rechaza/i);
  });

  it("no alarma con el stock cuando ya está confirmado", async () => {
    // Un confirmado ya descontó su stock: comparar cantidad contra el stock restante ahí
    // solo produce un falso positivo.
    renderDrawer(
      makeOrder({
        status: "confirmed",
        items: [
          {
            product_id: "p1",
            product_name: "Cera y Pomada",
            quantity: 5,
            unit_price: 17000,
            subtotal: 85000,
            product_price: 17000,
            product_stock: 0,
          },
        ],
      }),
    );
    await screen.findByText("Cera y Pomada");
    expect(screen.queryByText(/Quedan/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("señala cuando el precio del producto cambió desde el borrador", async () => {
    renderDrawer(
      makeOrder({
        items: [
          {
            product_id: "p1",
            product_name: "Cera y Pomada",
            quantity: 1,
            unit_price: 17000,
            subtotal: 17000,
            product_price: 20000,
            product_stock: 5,
          },
        ],
      }),
    );
    // El `unit_price` congelado es un invariante del modelo; lo que faltaba era DECIRLO.
    expect(await screen.findByText(/Precio actual \$20\.000/)).toBeInTheDocument();
  });
});

describe("OrderDetailDialog — acciones según el estado", () => {
  it("un borrador se puede editar, confirmar y cancelar", async () => {
    renderDrawer();
    await screen.findByText("Pedido #42");
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("un confirmado solo se puede cancelar, y solo desde acá", async () => {
    renderDrawer(makeOrder({ status: "confirmed" }));
    await screen.findByText("Pedido #42");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("un cancelado no ofrece ninguna acción sobre el pedido", async () => {
    renderDrawer(makeOrder({ status: "cancelled" }));
    await screen.findByText("Pedido #42");
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
  });
});
