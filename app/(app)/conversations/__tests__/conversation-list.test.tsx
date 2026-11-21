/**
 * La bandeja, ahora con UNA FILA POR NÚMERO.
 *
 * Lo que se fija acá es la honestidad de la fila: qué puede decir con los datos que
 * el servidor da, y qué no. En particular NO lleva un conteo de conversaciones —
 * solo abarcaría las páginas descargadas— y el pie tiene que mostrar las dos cifras
 * (números vs. conversaciones cargadas) porque la relación entre ellas es el dato.
 */
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Conversation, ConversationStatus } from "@/lib/types";
import type { CustomerSelection } from "@/components/customers/customer-combobox";

import { ConversationList } from "../_components/conversation-list";

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
    created_at: "2026-07-30T09:00:00Z",
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
 * La lista es controlada: buscador, estado y cliente los posee la página (viven en la
 * URL). El arnés hace de página para que un click siga cambiando lo que se ve, y de
 * paso deja espiar los callbacks.
 */
function Harness({
  conversations,
  onSelect,
  onClearFilters,
  initialCustomer = null,
  hasMore = false,
  onLoadMore = () => {},
  moreError = null,
  lastPageAddedNothing = false,
}: {
  conversations: Conversation[];
  onSelect: (customerId: string) => void;
  onClearFilters: () => void;
  initialCustomer?: CustomerSelection;
  hasMore?: boolean;
  onLoadMore?: () => void;
  moreError?: string | null;
  lastPageAddedNothing?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">("all");
  const [customer, setCustomer] = useState<CustomerSelection>(initialCustomer);
  return (
    <ConversationList
      conversations={conversations}
      selectedCustomerId={null}
      onSelect={onSelect}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
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
      lastPageAddedNothing={lastPageAddedNothing}
    />
  );
}

function renderList(
  conversations: Conversation[],
  opts: {
    initialCustomer?: CustomerSelection;
    hasMore?: boolean;
    moreError?: string | null;
    lastPageAddedNothing?: boolean;
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
      lastPageAddedNothing={opts.lastPageAddedNothing}
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

/** Tres conversaciones de DOS personas: el caso que la agrupación tiene que colapsar. */
const tresDeDos = [
  makeConv({
    id: "10",
    customer_id: "c1",
    last_message_preview: "gracias!",
    last_message_direction: "in",
    customer_rating_avg: 3.5,
    customer_rating_count: 2,
  }),
  makeConv({
    id: "11",
    customer_id: "c1",
    status: "closed",
    last_message_at: "2026-07-30T10:00:00Z",
    created_at: "2026-07-29T09:00:00Z",
    customer_rating_avg: 3.5,
    customer_rating_count: 2,
  }),
  makeConv({ id: "20", customer_id: "c2", customer_name: "Beto" }),
];

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

describe("ConversationList — una fila por número", () => {
  it("colapsa las conversaciones de la misma persona en una sola fila", () => {
    renderList(tresDeDos);
    // Dos filas, no tres: la fila es la persona.
    expect(screen.getAllByRole("button", { name: /Ana|Beto/ })).toHaveLength(2);
  });

  it("la fila resume la conversación MÁS RECIENTE de esa persona", () => {
    const { text } = renderList(tresDeDos);
    // El preview y el estado son los del hilo más nuevo de Ana, no los del cerrado.
    expect(text()).toContain("gracias!");
    const filaAna = screen.getByRole("button", { name: /Ana/ });
    expect(filaAna.textContent).toContain("IA");
  });

  it("al elegir una fila entrega el id del CLIENTE, no de una conversación", async () => {
    const { onSelect } = renderList(tresDeDos);
    await userEvent.click(screen.getByRole("button", { name: /Beto/ }));
    expect(onSelect).toHaveBeenCalledWith("c2");
  });

  it("NO muestra un conteo de conversaciones: solo contaría lo descargado", () => {
    const { text } = renderList(tresDeDos);
    expect(text()).not.toContain("2 conversaciones");
    expect(text()).not.toContain("1 conversación ");
  });

  it("suma los no leídos de todas las conversaciones del número", () => {
    renderList([
      makeConv({ id: "10", customer_id: "c1", unread: 2 }),
      makeConv({
        id: "11",
        customer_id: "c1",
        unread: 3,
        last_message_at: "2026-07-30T10:00:00Z",
      }),
    ]);
    // El badge visible es `aria-hidden`; el número vive en el nombre accesible. Y no
    // dice «sin leer»: el backend no expone eso, esto cuenta lo que llegó con la
    // pestaña abierta.
    expect(
      screen.getByRole("button", { name: /5 mensajes desde que abriste el panel/ }),
    ).toBeTruthy();
  });

  it("el nombre accesible dice el estado en largo, que fuera de contexto «IA» no dice", () => {
    renderList([makeConv({ customer_id: "c1", status: "human_handoff" })]);
    expect(screen.getByRole("button", { name: /Derivada a una persona/ })).toBeTruthy();
  });

  it("muestra el promedio DE LA PERSONA, que calcula el backend sobre todo su historial", () => {
    renderList(tresDeDos);
    expect(screen.getByLabelText("3,5 de 5")).toBeTruthy();
    // Sin notas no se dibuja un 0: se dice que no hay.
    expect(screen.getAllByText("Sin calificar").length).toBeGreaterThan(0);
  });
});

describe("ConversationList — el pie y sus dos cifras", () => {
  it("cuenta NÚMEROS arriba y conversaciones cargadas abajo", () => {
    const { text } = renderList(tresDeDos, { hasMore: true });
    expect(text()).toContain("2 números");
    expect(text()).toContain("3 conversaciones cargadas");
  });

  it("anuncia cuando una página no agregó ningún número nuevo", () => {
    renderList(tresDeDos, { hasMore: true, lastPageAddedNothing: true });
    // Un botón que no cambia nada se lee como roto: hay que decirlo, y a un lector
    // de pantalla también (`role="status"`).
    expect(screen.getByRole("status").textContent).toContain(
      "no agregó números nuevos",
    );
  });

  it("un fallo al paginar va al pie, no reemplaza la lista ya cargada", () => {
    renderList(tresDeDos, { hasMore: true, moreError: "Error de red" });
    expect(screen.getByRole("alert").textContent).toContain("Error de red");
    expect(screen.getAllByRole("button", { name: /Ana|Beto/ })).toHaveLength(2);
  });
});

describe("ConversationList — filtros", () => {
  it("el buscador dice que busca por nombre o teléfono, y dónde buscar texto", () => {
    renderList([]);
    const hint = screen.getByText(/Busca por nombre o teléfono/);
    // La API no busca en mensajes; ahora que la pantalla se comporta como WhatsApp
    // esa expectativa es más fuerte, así que la pista tiene que redirigirla.
    expect(hint.textContent).toContain("abrí un chat");
  });

  it("con un estado puesto explica que la fila resume solo esas conversaciones", async () => {
    renderList(tresDeDos);
    await userEvent.click(screen.getByRole("button", { name: "Cerrados" }));
    expect(screen.getByText(/Cada fila resume solo esas/)).toBeTruthy();
  });

  it("distingue «sin conversaciones» de «tu filtro no encontró nada»", async () => {
    const { onClearFilters } = renderList([]);
    expect(screen.getByText("Sin conversaciones")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Cerrados" }));
    expect(screen.getByText("Sin resultados")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onClearFilters).toHaveBeenCalled();
  });
});
