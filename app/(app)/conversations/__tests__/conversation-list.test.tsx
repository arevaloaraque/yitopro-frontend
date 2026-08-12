import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Conversation, ConversationStatus } from "@/lib/types";
import type { CustomerSelection } from "@/components/customers/customer-combobox";

import { ConversationList, type InboxView } from "../_components/conversation-list";

// El filtro de cliente pide clientes al montarse; aquí no se está probando ese combobox.
vi.mock("@/lib/api/customers", () => ({
  searchCustomers: vi.fn(async () => ({ items: [], count: 0 })),
}));

function makeConv(over: Partial<Conversation> = {}): Conversation {
  return {
    id: "1",
    customer_id: "c1",
    customer_name: "Ana",
    customer_phone: "+56911112222",
    status: "ai_active",
    active_agent: null,
    assignee_id: null,
    last_message_at: "2026-07-31T10:00:00Z",
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

/**
 * La lista es controlada: vista, buscador, estado y cliente los posee la página (viven en la
 * URL). El arnés hace de página para que un click siga cambiando lo que se ve, y de paso
 * deja espiar los callbacks.
 */
function Harness({
  conversations,
  onSelect,
  onClearFilters,
  initialCustomer = null,
  hasMore = false,
  onLoadMore = () => {},
  moreError = null,
}: {
  conversations: Conversation[];
  onSelect: (id: string) => void;
  onClearFilters: () => void;
  initialCustomer?: CustomerSelection;
  hasMore?: boolean;
  onLoadMore?: () => void;
  moreError?: string | null;
}) {
  const [view, setView] = useState<InboxView>("thread");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">("all");
  const [customer, setCustomer] = useState<CustomerSelection>(initialCustomer);
  return (
    <ConversationList
      conversations={conversations}
      selectedId={null}
      onSelect={onSelect}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      view={view}
      onViewChange={setView}
      search={search}
      onSearchChange={setSearch}
      customer={customer}
      onCustomerChange={setCustomer}
      onClearFilters={onClearFilters}
      loading={false}
      error={null}
      onRetry={vi.fn()}
      agentNames={new Map([["sales", "Ventas"]])}
      hasMore={hasMore}
      loadingMore={false}
      onLoadMore={onLoadMore}
      moreError={moreError}
    />
  );
}

function renderList(
  conversations: Conversation[],
  opts: {
    initialCustomer?: CustomerSelection;
    hasMore?: boolean;
    moreError?: string | null;
  } = {},
) {
  const onSelect = vi.fn();
  const onClearFilters = vi.fn();
  const onLoadMore = vi.fn();
  const { container } = render(
    <Harness
      conversations={conversations}
      onSelect={onSelect}
      onClearFilters={onClearFilters}
      initialCustomer={opts.initialCustomer}
      hasMore={opts.hasMore}
      onLoadMore={onLoadMore}
      moreError={opts.moreError}
    />,
  );
  // `textContent` de la fila: es la línea que el operador lee de corrido. Afirmar el prefijo
  // como elemento suelto es frágil (queda en su propio span, pegado al texto).
  return {
    onSelect,
    onClearFilters,
    onLoadMore,
    text: () => container.textContent ?? "",
  };
}

describe("ConversationList — preview del último mensaje", () => {
  it("muestra el texto del cliente sin prefijo (su nombre ya está en la fila)", () => {
    const { text } = renderList([
      makeConv({
        last_message_preview: "hola, tienen hora el sabado?",
        last_message_direction: "in",
        last_message_sender_kind: "",
      }),
    ]);
    expect(text()).toContain("hola, tienen hora el sabado?");
    expect(text()).not.toContain("Tú:");
  });

  it.each([
    ["operator", "Tú: "],
    ["ai", "IA: "],
    ["system", "Automático: "],
  ])("dice quién escribió un mensaje saliente (%s)", (kind, prefix) => {
    const { text } = renderList([
      makeConv({
        last_message_preview: "te confirmo tu cita",
        last_message_direction: "out",
        last_message_sender_kind: kind,
      }),
    ]);
    // El autor ES la información: en este inbox un saliente puede venir del asistente, de
    // un operador o del motor de automatizaciones, y «Tú:» se lee muy distinto.
    expect(text()).toContain(`${prefix}te confirmo tu cita`);
  });

  it("dice «Sin mensajes» en un hilo recién creado, sin inventar texto", () => {
    renderList([makeConv({ last_message_preview: "" })]);
    expect(screen.getByText("Sin mensajes")).toBeTruthy();
  });
});

describe("ConversationList — rating", () => {
  it("muestra la nota de cada hilo, y por qué falta cuando no la tiene", () => {
    renderList([
      makeConv({ id: "1", customer_rating: 4, rating_status: "rated" }),
      makeConv({ id: "2", customer_rating: null, rating_status: "pending" }),
    ]);
    // La nota se pinta como estrellas; el número vive en el nombre accesible.
    expect(screen.getByLabelText("4 de 5")).toBeTruthy();
    expect(screen.getByText("Sin calificar aún")).toBeTruthy();
  });
});

describe("ConversationList — vista por número", () => {
  const dosHilos = [
    makeConv({
      id: "10",
      customer_id: "c1",
      last_message_preview: "gracias!",
      last_message_direction: "in",
      customer_rating: 4,
      rating_status: "rated",
      customer_rating_avg: 3.5,
      customer_rating_count: 2,
    }),
    makeConv({
      id: "11",
      customer_id: "c1",
      status: "closed",
      last_message_at: "2026-07-30T10:00:00Z",
      customer_rating: 3,
      rating_status: "rated",
      customer_rating_avg: 3.5,
      customer_rating_count: 2,
    }),
    makeConv({ id: "20", customer_id: "c2", customer_name: "Beto" }),
  ];

  it("arranca por conversación: la vista agrupada se agrega, no reemplaza", () => {
    renderList(dosHilos);
    expect(
      screen
        .getByRole("button", { name: "Por conversación" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    // Tres filas de hilo, no dos grupos.
    expect(screen.getAllByText(/Ana|Beto/).length).toBe(3);
  });

  it("agrupa por número y cuenta los hilos de cada uno", async () => {
    renderList(dosHilos);
    await userEvent.click(screen.getByRole("button", { name: "Por número" }));

    expect(screen.getByText("2 conversaciones")).toBeTruthy();
    expect(screen.getByText("1 conversación")).toBeTruthy();
    // El encabezado muestra el promedio DE LA PERSONA (3,5), no el de los hilos en pantalla
    // — que serían solo los cargados y calificados. En variante compacta: el conteo de
    // hilos ya está al lado, y dos «conversaciones» distintas pegadas se leen como una
    // contradicción.
    expect(screen.getByLabelText("3,5 de 5")).toBeTruthy();
    // La cola «· N conversaciones» sigue fuera en modo compacto: las dos que se ven
    // («2 conversaciones», «1 conversación») cuentan hilos, no la muestra del promedio.
    expect(screen.queryByText(/· \d+ conversaci/)).toBeNull();
  });

  it("sigue permitiendo abrir un hilo concreto desde el grupo", async () => {
    const { onSelect } = renderList(dosHilos);
    await userEvent.click(screen.getByRole("button", { name: "Por número" }));
    // En un grupo la fila del hilo se rotula con su estado corto ("IA"/"Cerrado"), porque
    // el nombre ya está en el encabezado. La primera es la más reciente.
    await userEvent.click(screen.getAllByText("IA")[0]);
    expect(onSelect).toHaveBeenCalledWith("10");
  });

  it("se puede colapsar un grupo sin perder el resto", async () => {
    renderList(dosHilos);
    await userEvent.click(screen.getByRole("button", { name: "Por número" }));
    const header = screen.getAllByRole("button", { expanded: true })[0];
    await userEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    // El otro grupo sigue ahí.
    expect(screen.getByText("1 conversación")).toBeTruthy();
  });
});

describe("ConversationList — buscador", () => {
  it("NO recorta en el navegador: dibuja la página que llegó del servidor", async () => {
    renderList([
      makeConv({ id: "1", customer_name: "Ana", customer_phone: "+56911112222" }),
      makeConv({ id: "2", customer_name: "Beto", customer_phone: "+56933334444" }),
    ]);

    // El término va a `?search=` y el backend compara por CONTIENE (teléfono en dígitos en
    // los dos lados). Volver a filtrar aquí convertiría el buscador en «lo que coincide de
    // las 25 filas que bajé», que con la bandeja paginada es un filtro que miente.
    await userEvent.type(screen.getByRole("textbox", { name: /buscar/i }), "Ana");

    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("Beto")).toBeTruthy();
  });

  it("dice que busca en todo el historial y que distingue acentos", () => {
    renderList([makeConv()]);
    const hint = screen.getByText(/todo el historial/i);
    // La limitación es real (`icontains` sin `unaccent`): un buscador que no encuentra un
    // nombre que existe se lee como roto si nadie lo avisa.
    expect(hint.textContent).toContain("acentos");
    expect(
      screen.getByRole("textbox", { name: /buscar/i }).getAttribute("aria-describedby"),
    ).toBe(hint.getAttribute("id"));
  });
});

describe("ConversationList — paginación por cursor", () => {
  it("cuenta lo que hay en pantalla y avisa que hay más, sin un total", async () => {
    const { onLoadMore } = renderList([makeConv({ id: "1" }), makeConv({ id: "2" })], {
      hasMore: true,
    });

    // Sin «de N»: el backend no manda `count` a propósito. Si aparece un total aquí,
    // alguien reintrodujo el COUNT sobre la tabla que más crece del producto.
    expect(screen.getByText("2 conversaciones (hay más)")).toBeTruthy();
    expect(screen.queryByText(/ de \d+/)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it("no ofrece «Cargar más» cuando la página es la última", () => {
    renderList([makeConv()], { hasMore: false });
    expect(screen.getByText("1 conversación")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });

  it("si falla la página siguiente lo dice en el pie, sin borrar lo ya cargado", () => {
    renderList([makeConv({ customer_name: "Ana" })], {
      hasMore: true,
      moreError: "No se pudo cargar la página siguiente.",
    });
    // Un `ErrorState` aquí borraría de la pantalla la página que el operador está leyendo.
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("página siguiente");
    // Y el botón sigue ahí: reintentar es un clic.
    expect(screen.getByRole("button", { name: "Cargar más" })).toBeTruthy();
  });
});

describe("ConversationList — filtros", () => {
  it("marca con aria-pressed la pestaña de estado activa, no solo con color", async () => {
    renderList([makeConv()]);
    const todos = screen.getByRole("button", { name: "Todos" });
    const cerrados = screen.getByRole("button", { name: "Cerrados" });
    expect(todos.getAttribute("aria-pressed")).toBe("true");
    expect(cerrados.getAttribute("aria-pressed")).toBe("false");

    await userEvent.click(cerrados);
    expect(cerrados.getAttribute("aria-pressed")).toBe("true");
    expect(todos.getAttribute("aria-pressed")).toBe("false");
  });

  it("distingue «todavía no hay nada» de «tu filtro no encontró nada»", async () => {
    const { onClearFilters } = renderList([]);
    // Sin filtro puesto la bandeja vacía no es culpa de nadie: no ofrece limpiar nada.
    expect(screen.getByText("Sin conversaciones")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).toBeNull();

    await userEvent.type(screen.getByRole("textbox", { name: /buscar/i }), "zzz");

    expect(screen.getByText("Sin resultados")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onClearFilters).toHaveBeenCalled();
  });

  it("ofrece limpiar cuando el vacío lo produce un filtro de servidor", () => {
    // El recorte por cliente lo aplica el backend: la lista llega vacía y no hay texto en el
    // buscador del que deducir que hay un filtro puesto.
    renderList([], { initialCustomer: { id: "c9", name: "Ana" } });
    expect(screen.getByText("Sin resultados")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Limpiar filtros" })).toBeTruthy();
  });
});
