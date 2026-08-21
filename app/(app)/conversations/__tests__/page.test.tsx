/**
 * La pantalla de conversaciones, ahora un chat continuo POR NÚMERO.
 *
 * Cada caso de acá viene de uno que existía antes: la pantalla cambió de modelo
 * —de «una conversación seleccionada» a «el historial de un número»— así que las
 * aserciones se retargetearon, no se borraron. Las tres que probaban el encadenado
 * de páginas y el merge se mudaron a `lib/conversations/__tests__/thread.test.ts`,
 * donde la lógica es pura y está verificada por mutación; acá queda el CABLEADO.
 *
 * `lib/api` y `lib/sse` van mockeados: esto ejercita la máquina de estados de la
 * pantalla, no el cable HTTP.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SSEEvent } from "@/lib/types";

import {
  getConversation,
  listConversations,
  listMessages,
  type ConversationPage,
} from "@/lib/api/conversations";
import type { Conversation, Message } from "@/lib/types";

import ConversationsPage from "../page";

vi.mock("@/lib/api/conversations");
// El filtro «Cliente» del inbox pide clientes al montarse (combobox con búsqueda en
// servidor); aquí solo interesa que la página le pase el id elegido a listConversations.
vi.mock("@/lib/api/customers", () => ({
  searchCustomers: vi.fn(async () => ({
    items: [{ id: "cust-2", name: "Bruno", phone: "+56933334444" }],
    count: 1,
  })),
}));
// The page derives agent names from the shared provider (useAgents), not a
// per-page fetch — mock the hook so the page renders without an AgentsProvider.
vi.mock("@/lib/agents", () => ({
  useAgents: () => ({ agents: [] }),
}));
// Capture the SSE handler so tests can push events through it.
const { sseHandlers } = vi.hoisted(() => ({
  sseHandlers: [] as ((event: SSEEvent) => void)[],
}));
vi.mock("@/lib/sse", () => ({
  subscribeToEvents: (handler: (event: SSEEvent) => void) => {
    sseHandlers.push(handler);
    return () => {
      const i = sseHandlers.indexOf(handler);
      if (i >= 0) sseHandlers.splice(i, 1);
    };
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "op-1", email: "op@x.cl", name: "Op" } }),
}));
// El número abierto se siembra de `?chat=`; `?id=` se acepta como entrada y se
// resuelve a `chat=`. Se mockea `useSearchParams` para poder dirigir esa entrada.
const { searchParamsStub } = vi.hoisted(() => ({
  searchParamsStub: { current: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsStub.current,
  // La página consulta el router desde `useRequireAssistant`, que devuelve al
  // dashboard cuando el plan no incluye asistente. Aquí nunca dispara (el
  // negocio del fixture sí lo incluye), pero el hook lo pide igual.
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

function emitSse(event: SSEEvent) {
  act(() => {
    for (const handler of sseHandlers) handler(event);
  });
}

function makeConversation(over: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    customer_id: "cust-1",
    customer_name: "Ana",
    customer_phone: "+56911112222",
    status: "human_handoff",
    active_agent: null,
    assignee_id: null,
    last_message_at: "2026-06-30T10:00:00Z",
    created_at: "2026-06-29T09:00:00Z",
    unread: 0,
    customer_rating: null,
    rating_status: "pending",
    customer_rating_avg: null,
    customer_rating_count: 0,
    // El backend calcula el preview del último mensaje, así que un preview VACÍO
    // significa «sin mensajes» y el hilo no le pide ninguna página. Un fixture con
    // mensajes y preview vacío es una combinación que la API no puede producir.
    // Distinto del texto de `makeMessage`: si coinciden, un `getByText` encuentra dos
    // elementos (el preview de la fila y la burbuja) y el test no distingue cuál mira.
    last_message_preview: "ultimo mensaje",
    last_message_direction: "in",
    last_message_sender_kind: "",
    ...over,
  };
}

function makeMessage(over: Partial<Message> = {}): Message {
  return {
    id: "m1",
    conversation_id: "conv-1",
    direction: "inbound",
    sender: "customer",
    text: "hola equipo",
    created_at: "2026-06-30T10:00:00Z",
    ...over,
  };
}

/** La bandeja llega paginada por cursor y SIN total: `{items, next_cursor, has_more}`. */
function inboxPage(items: Conversation[], over: Partial<ConversationPage> = {}) {
  return { items, next_cursor: "", has_more: false, ...over };
}

/** Una página del hilo. `has_more` = «hay historia MÁS VIEJA arriba». */
function threadPage(items: Message[], hasMore = false) {
  return { items, has_more: hasMore };
}

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.length = 0;
  searchParamsStub.current = new URLSearchParams();
  window.history.replaceState(null, "", "/");
  // jsdom doesn't implement scrollIntoView (used by the message thread).
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  // Default para `getConversation`: la página la llama en CADA evento de mensaje para
  // refrescar el preview de esa fila (el evento no puede traer el texto — es PII). Sin un
  // valor por defecto, los tests de SSE explotan con `undefined.then`, que se lee como un
  // bug de la página y no como un mock sin configurar. Los tests que sí les importa el
  // resultado lo sobrescriben.
  vi.mocked(getConversation).mockResolvedValue(makeConversation());
});

/** Abre el primer número de la bandeja y espera a que el hilo esté en pantalla. */
async function abrirPrimerNumero(nombre: RegExp = /Ana/) {
  render(<ConversationsPage />);
  const fila = await screen.findByRole("button", { name: nombre });
  await userEvent.click(fila);
  return fila;
}

describe("ConversationsPage — abrir el hilo de un número", () => {
  it("pide el índice del CLIENTE y después sus mensajes", async () => {
    vi.mocked(listConversations).mockResolvedValue(inboxPage([makeConversation()]));
    vi.mocked(listMessages).mockResolvedValue(threadPage([makeMessage()]));

    await abrirPrimerNumero();

    await waitFor(() =>
      // El índice se pide por `customer_id` y de 100: por un request queda el
      // esqueleto completo del historial de esa persona.
      expect(listConversations).toHaveBeenCalledWith(
        { customerId: "cust-1" },
        { limit: 100 },
      ),
    );
    expect(await screen.findByText("hola equipo")).toBeTruthy();
  });

  it("volver a pulsar el mismo número no borra el hilo (el bug del doble clic)", async () => {
    vi.mocked(listConversations).mockResolvedValue(inboxPage([makeConversation()]));
    vi.mocked(listMessages).mockResolvedValue(threadPage([makeMessage()]));

    const fila = await abrirPrimerNumero();
    expect(await screen.findByText("hola equipo")).toBeTruthy();

    await userEvent.click(fila);
    // Sigue en pantalla: ni se vacía ni queda colgado en el esqueleto.
    expect(screen.getByText("hola equipo")).toBeTruthy();
  });

  it("cambiar de número carga el historial del otro", async () => {
    const ana = makeConversation();
    const bruno = makeConversation({
      id: "conv-2",
      customer_id: "cust-2",
      customer_name: "Bruno",
      last_message_at: "2026-06-29T10:00:00Z",
    });
    // El mock RESPETA `customer_id`, como el servidor: el índice de un número no
    // puede traer las conversaciones de otro.
    vi.mocked(listConversations).mockImplementation(async (params) =>
      inboxPage(
        params?.customerId
          ? [ana, bruno].filter((c) => c.customer_id === params.customerId)
          : [ana, bruno],
      ),
    );
    vi.mocked(listMessages).mockImplementation(async (id: string) =>
      threadPage([makeMessage({ id: `m-${id}`, text: `mensaje de ${id}` })]),
    );

    render(<ConversationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Ana/ }));
    expect(await screen.findByText("mensaje de conv-1")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Bruno/ }));
    expect(await screen.findByText("mensaje de conv-2")).toBeTruthy();
  });
});

describe("ConversationsPage — la URL: `chat=` es la clave, `?id=` es una entrada", () => {
  it("al elegir un número escribe `?chat=` con el id del CLIENTE", async () => {
    vi.mocked(listConversations).mockResolvedValue(inboxPage([makeConversation()]));
    vi.mocked(listMessages).mockResolvedValue(threadPage([makeMessage()]));

    await abrirPrimerNumero();

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("chat")).toBe("cust-1"),
    );
  });

  it("un `?id=` de la página cargada abre su número y reescribe la URL", async () => {
    searchParamsStub.current = new URLSearchParams("id=conv-1");
    vi.mocked(listConversations).mockResolvedValue(inboxPage([makeConversation()]));
    vi.mocked(listMessages).mockResolvedValue(threadPage([makeMessage()]));

    render(<ConversationsPage />);

    expect(await screen.findByText("hola equipo")).toBeTruthy();
    await waitFor(() => {
      const qs = new URLSearchParams(window.location.search);
      expect(qs.get("chat")).toBe("cust-1");
      // `id` no queda como clave paralela: se resuelve una vez y se borra.
      expect(qs.get("id")).toBeNull();
    });
  });

  it("un `?id=` FUERA de la página cargada se resuelve y abre el hilo igual", async () => {
    // Antes esto mostraba «Selecciona una conversación» con los mensajes ya bajados
    // y descartados, porque la conversación abierta se derivaba de la lista. Lo
    // sufren la campana y el drawer de cliente, que enlazan cualquier id.
    searchParamsStub.current = new URLSearchParams("id=conv-99");
    const zoe = makeConversation({
      id: "conv-99",
      customer_id: "cust-9",
      customer_name: "Zoe",
    });
    // La bandeja NO trae conv-99 (está en otra página), pero el índice del número de
    // Zoe sí: es exactamente la situación que rompía la pantalla antes.
    vi.mocked(listConversations).mockImplementation(async (params) =>
      inboxPage(params?.customerId === "cust-9" ? [zoe] : [makeConversation()]),
    );
    vi.mocked(getConversation).mockResolvedValue(zoe);
    vi.mocked(listMessages).mockResolvedValue(
      threadPage([makeMessage({ text: "mensaje viejo" })]),
    );

    render(<ConversationsPage />);

    await waitFor(() => expect(getConversation).toHaveBeenCalledWith("conv-99"));
    expect(await screen.findByText("mensaje viejo")).toBeTruthy();
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("chat")).toBe("cust-9"),
    );
  });

  it("un `?id=` que no resuelve muestra un error con reintento, no un vacío", async () => {
    searchParamsStub.current = new URLSearchParams("id=conv-borrada");
    vi.mocked(listConversations).mockResolvedValue(inboxPage([makeConversation()]));
    vi.mocked(getConversation).mockRejectedValue(new Error("No encontrada"));

    render(<ConversationsPage />);

    expect(await screen.findByText("No se pudo abrir esa conversación")).toBeTruthy();
    // La bandeja sigue usable: lo que falló es abrir ese enlace.
    expect(screen.getByRole("button", { name: /Ana/ })).toBeTruthy();
  });

  it("los filtros no cierran el hilo abierto: `chat=` se preserva", async () => {
    vi.mocked(listConversations).mockResolvedValue(inboxPage([makeConversation()]));
    vi.mocked(listMessages).mockResolvedValue(threadPage([makeMessage()]));

    await abrirPrimerNumero();
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("chat")).toBe("cust-1"),
    );

    await userEvent.click(screen.getByRole("button", { name: "Cerrados" }));

    await waitFor(() => {
      const qs = new URLSearchParams(window.location.search);
      expect(qs.get("status")).toBe("closed");
      expect(qs.get("chat")).toBe("cust-1");
    });
  });
});

describe("ConversationsPage — la bandeja", () => {
  it("manda el buscador al SERVIDOR (`?search=`), sin recortar en el navegador", async () => {
    vi.mocked(listConversations).mockResolvedValue(
      inboxPage([makeConversation({ customer_name: "Ana" })]),
    );
    render(<ConversationsPage />);
    await screen.findByRole("button", { name: /Ana/ });

    await userEvent.type(screen.getByLabelText(/Buscar por nombre o teléfono/), "bru");

    await waitFor(() =>
      expect(listConversations).toHaveBeenCalledWith(
        expect.objectContaining({ search: "bru" }),
      ),
    );
  });

  it("«Cargar más» devuelve el cursor OPACO y suma la página siguiente", async () => {
    vi.mocked(listConversations).mockResolvedValueOnce(
      inboxPage([makeConversation()], { next_cursor: "OPACO==", has_more: true }),
    );
    vi.mocked(listMessages).mockResolvedValue(threadPage([]));
    render(<ConversationsPage />);
    await screen.findByRole("button", { name: /Ana/ });

    vi.mocked(listConversations).mockResolvedValueOnce(
      inboxPage([
        makeConversation({
          id: "conv-2",
          customer_id: "cust-2",
          customer_name: "Bruno",
        }),
      ]),
    );
    await userEvent.click(screen.getByRole("button", { name: /Cargar más/ }));

    await waitFor(() =>
      // El cursor viaja tal cual: no se construye ni se parsea en el cliente.
      expect(listConversations).toHaveBeenCalledWith(expect.anything(), {
        cursor: "OPACO==",
      }),
    );
    expect(await screen.findByRole("button", { name: /Bruno/ })).toBeTruthy();
    // Dos cifras: el servidor pagina conversaciones y la lista muestra números.
    expect(screen.getByText(/2 números/)).toBeTruthy();
  });

  it("arranca con el estado que dice la URL y se lo pide al servidor", async () => {
    searchParamsStub.current = new URLSearchParams("status=closed");
    vi.mocked(listConversations).mockResolvedValue(
      inboxPage([makeConversation({ status: "closed" })]),
    );
    render(<ConversationsPage />);

    await waitFor(() =>
      expect(listConversations).toHaveBeenCalledWith({ status: "closed" }),
    );
    expect(
      screen.getByRole("button", { name: "Cerrados" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("cae a «Todos» con un status inventado en la URL, sin mandárselo al backend", async () => {
    searchParamsStub.current = new URLSearchParams("status=lol");
    vi.mocked(listConversations).mockResolvedValue(inboxPage([makeConversation()]));
    render(<ConversationsPage />);

    await waitFor(() => expect(listConversations).toHaveBeenCalledWith({}));
    expect(
      screen.getByRole("button", { name: "Todos" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("ConversationsPage — el SSE", () => {
  it("una ráfaga de mensajes se cobra UNA recarga del hilo, no una por evento", async () => {
    vi.mocked(listConversations).mockResolvedValue(inboxPage([makeConversation()]));
    vi.mocked(listMessages).mockResolvedValue(threadPage([makeMessage()]));

    await abrirPrimerNumero();
    await screen.findByText("hola equipo");
    const antes = vi.mocked(listMessages).mock.calls.length;

    for (let i = 0; i < 4; i++) {
      emitSse({
        type: "mensaje_recibido",
        emitted_at: `2026-06-30T10:0${i}:00Z`,
        data: { conversation_id: "conv-1", message_id: `m${i}` },
      } as SSEEvent);
    }

    await waitFor(() =>
      expect(vi.mocked(listMessages).mock.calls.length).toBeGreaterThan(antes),
    );
    // Cuatro eventos, una recarga: el coalescing de 250 ms.
    expect(vi.mocked(listMessages).mock.calls.length - antes).toBe(1);
  });

  it("no recarga el hilo por un mensaje de OTRO número", async () => {
    vi.mocked(listConversations).mockResolvedValue(
      inboxPage([
        makeConversation(),
        makeConversation({
          id: "conv-2",
          customer_id: "cust-2",
          customer_name: "Bruno",
        }),
      ]),
    );
    vi.mocked(listMessages).mockResolvedValue(threadPage([makeMessage()]));

    await abrirPrimerNumero();
    await screen.findByText("hola equipo");
    const antes = vi.mocked(listMessages).mock.calls.length;

    emitSse({
      type: "mensaje_recibido",
      emitted_at: "2026-06-30T11:00:00Z",
      data: { conversation_id: "conv-2", message_id: "mx" },
    } as SSEEvent);

    // La fila se refresca (eso sí interesa), pero el hilo abierto es de otro número:
    // bajar sus mensajes sería puro gasto.
    await waitFor(() => expect(getConversation).toHaveBeenCalled());
    expect(vi.mocked(listMessages).mock.calls.length).toBe(antes);
  });

  it("una conversación nueva desconocida entra en la bandeja en vez de perderse", async () => {
    vi.mocked(listConversations).mockResolvedValue(inboxPage([makeConversation()]));
    vi.mocked(listMessages).mockResolvedValue(threadPage([]));
    vi.mocked(getConversation).mockResolvedValue(
      makeConversation({ id: "conv-9", customer_id: "cust-9", customer_name: "Nueva" }),
    );
    render(<ConversationsPage />);
    await screen.findByRole("button", { name: /Ana/ });

    emitSse({
      type: "mensaje_recibido",
      emitted_at: "2026-06-30T12:00:00Z",
      data: { conversation_id: "conv-9", message_id: "m9" },
    } as SSEEvent);

    expect(await screen.findByRole("button", { name: /Nueva/ })).toBeTruthy();
  });

  it("refresca la fila cuando entra un mensaje y conserva los no leídos", async () => {
    vi.mocked(listConversations).mockResolvedValue(
      inboxPage([makeConversation({ last_message_preview: "viejo" })]),
    );
    vi.mocked(listMessages).mockResolvedValue(threadPage([]));
    vi.mocked(getConversation).mockResolvedValue(
      makeConversation({ last_message_preview: "nuevo de verdad" }),
    );
    render(<ConversationsPage />);
    await screen.findByRole("button", { name: /Ana/ });

    emitSse({
      type: "mensaje_recibido",
      emitted_at: "2026-06-30T13:00:00Z",
      data: { conversation_id: "conv-1", message_id: "m2" },
    } as SSEEvent);

    // El preview no se puede parchear desde el payload (viaja sin texto), así que se
    // re-pide la fila; y el contador de no leídos que el handler acaba de subir NO se
    // pierde en ese refetch, porque el backend lo devuelve en 0.
    expect(await screen.findByText(/nuevo de verdad/)).toBeTruthy();
    expect(
      await screen.findByRole("button", {
        name: /1 mensaje desde que abriste el panel/,
      }),
    ).toBeTruthy();
  });

  it("un cierre en vivo actualiza la cabecera del hilo, no solo la fila", async () => {
    vi.mocked(listConversations).mockResolvedValue(
      inboxPage([makeConversation({ status: "ai_active" })]),
    );
    vi.mocked(listMessages).mockResolvedValue(threadPage([makeMessage()]));

    await abrirPrimerNumero();
    await screen.findByText("hola equipo");

    vi.mocked(getConversation).mockResolvedValue(
      makeConversation({ status: "closed" }),
    );
    emitSse({
      type: "conversacion_cerrada",
      emitted_at: "2026-06-30T14:00:00Z",
      data: { conversation_id: "conv-1", reason: "manual" },
    } as SSEEvent);

    // Sin el parche hermano sobre el hilo, la cabecera se quedaba diciendo que hay
    // una conversación abierta sobre una ya cerrada.
    expect(await screen.findByText("Sin conversación abierta")).toBeTruthy();
  });
});
