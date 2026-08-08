import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Conversation } from "@/lib/types";

import { ConversationList } from "../_components/conversation-list";

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

function renderList(conversations: Conversation[], onSelect = vi.fn()) {
  const { container } = render(
    <ConversationList
      conversations={conversations}
      selectedId={null}
      onSelect={onSelect}
      statusFilter="all"
      onStatusFilterChange={vi.fn()}
      loading={false}
      error={null}
      onRetry={vi.fn()}
      agentNames={new Map([["sales", "Ventas"]])}
    />,
  );
  // `textContent` de la fila: es la línea que el operador lee de corrido. Afirmar el prefijo
  // como elemento suelto es frágil (queda en su propio span, pegado al texto).
  return { onSelect, text: () => container.textContent ?? "" };
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
    expect(screen.getByText("4")).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "Por conversación" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
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
    expect(screen.getByText("3,5")).toBeTruthy();
    expect(screen.getByText("/ 5")).toBeTruthy();
    expect(screen.queryByText(/\/ 5 · /)).toBeNull();
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
