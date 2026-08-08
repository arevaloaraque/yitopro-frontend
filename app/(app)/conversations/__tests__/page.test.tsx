/**
 * Conversations page — message-thread loading state machine.
 *
 * Regression guard for the double-click bug: re-clicking the already-open
 * conversation must NOT wipe its messages nor get stuck on the loading
 * skeleton. lib/api and lib/sse are mocked so this exercises the page's own
 * state machine in isolation.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SSEEvent } from "@/lib/types";

import {
  getConversation,
  listConversations,
  listMessages,
} from "@/lib/api/conversations";
import type { Conversation, Message } from "@/lib/types";

import ConversationsPage from "../page";

vi.mock("@/lib/api/conversations");
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
// selectedId is seeded from the URL (?id=…); mock useSearchParams so tests can
// drive the initial deep-linked selection. Reset to empty in beforeEach.
const { searchParamsStub } = vi.hoisted(() => ({
  searchParamsStub: { current: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsStub.current,
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

describe("ConversationsPage — message loading", () => {
  it("keeps messages visible and not stuck loading when the same conversation is clicked twice", async () => {
    vi.mocked(listConversations).mockResolvedValue([makeConversation()]);
    vi.mocked(listMessages).mockResolvedValue([makeMessage()]);

    render(<ConversationsPage />);

    const row = await screen.findByRole("button", { name: /Ana/ });
    await userEvent.click(row);

    // First load resolves: message visible, skeleton gone.
    expect(await screen.findByText("hola equipo")).toBeInTheDocument();

    // Double-click the SAME conversation.
    await userEvent.click(row);

    // The message must remain and the thread must not be stuck on the skeleton.
    expect(screen.getByText("hola equipo")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("loads the second conversation's messages when switching", async () => {
    vi.mocked(listConversations).mockResolvedValue([
      makeConversation(),
      makeConversation({ id: "conv-2", customer_id: "cust-2", customer_name: "Bruno" }),
    ]);
    vi.mocked(listMessages).mockImplementation(async (id: string) =>
      id === "conv-2"
        ? [makeMessage({ id: "m2", conversation_id: "conv-2", text: "mensaje dos" })]
        : [makeMessage()],
    );

    render(<ConversationsPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Ana/ }));
    expect(await screen.findByText("hola equipo")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Bruno/ }));
    expect(await screen.findByText("mensaje dos")).toBeInTheDocument();
  });
});

describe("ConversationsPage — live SSE freshness", () => {
  it("reverts a conversation the AI reactivated (no longer stuck on Handoff)", async () => {
    // Owned by me + handed off → the take button is hidden and I can reply.
    vi.mocked(listConversations).mockResolvedValue([
      makeConversation({ status: "human_handoff", assignee_id: "op-1" }),
    ]);
    vi.mocked(listMessages).mockResolvedValue([makeMessage()]);

    render(<ConversationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Ana/ }));
    expect(await screen.findByText("hola equipo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tomar/ })).not.toBeInTheDocument();

    // The AI regains the conversation (inactivity timeout).
    emitSse({
      id: "e1",
      type: "conversacion_reactivada",
      emitted_at: "2026-06-30T10:05:00Z",
      data: { conversation_id: "conv-1", reason: "timeout" },
    } as SSEEvent);

    // It must flip back to AI-active: the take button reappears, no longer stuck.
    expect(await screen.findByRole("button", { name: /Tomar/ })).toBeInTheDocument();
  });

  it("shows an automatic message pushed to the open conversation", async () => {
    vi.mocked(listConversations).mockResolvedValue([makeConversation()]);
    vi.mocked(listMessages).mockResolvedValue([makeMessage()]);

    render(<ConversationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Ana/ }));
    expect(await screen.findByText("hola equipo")).toBeInTheDocument();

    // The automation engine delivers a reminder on this conversation.
    vi.mocked(listMessages).mockResolvedValue([
      makeMessage(),
      makeMessage({
        id: "m-auto",
        text: "recordatorio automático",
        direction: "outbound",
      }),
    ]);
    emitSse({
      id: "e2",
      type: "mensaje_automatico_enviado",
      emitted_at: "2026-06-30T10:06:00Z",
      data: {
        conversation_id: "conv-1",
        scheduled_message_id: "s1",
        rule_code: "reminder_24h",
        customer_id: "cust-1",
      },
    } as SSEEvent);

    expect(await screen.findByText("recordatorio automático")).toBeInTheDocument();
  });

  it("inserts a brand-new conversation into the inbox on mensaje_recibido for an unknown id", async () => {
    vi.mocked(listConversations).mockResolvedValue([makeConversation()]);
    vi.mocked(listMessages).mockResolvedValue([makeMessage()]);
    vi.mocked(getConversation).mockResolvedValue(
      makeConversation({
        id: "conv-2",
        customer_id: "cust-2",
        customer_name: "Bruno",
        last_message_at: "2026-06-30T10:10:00Z",
      }),
    );

    render(<ConversationsPage />);
    await screen.findByRole("button", { name: /Ana/ });

    // A message arrives for a conversation not yet in the inbox (e.g. its
    // very first message): it must be fetched and inserted, not dropped.
    emitSse({
      id: "e3",
      type: "mensaje_recibido",
      emitted_at: "2026-06-30T10:10:00Z",
      data: { conversation_id: "conv-2", message_id: "m-new" },
    } as SSEEvent);

    expect(await screen.findByRole("button", { name: /Bruno/ })).toBeInTheDocument();
    expect(getConversation).toHaveBeenCalledWith("conv-2");
  });
});

describe("ConversationsPage — URL selection (CONV-02) & search (CONV-01)", () => {
  it("preselects the conversation from ?id= on mount (deep-link / survives F5)", async () => {
    searchParamsStub.current = new URLSearchParams("id=conv-1");
    vi.mocked(listConversations).mockResolvedValue([makeConversation()]);
    vi.mocked(listMessages).mockResolvedValue([makeMessage()]);

    render(<ConversationsPage />);

    // No click needed: the detail opens straight from the URL param.
    expect(await screen.findByText("hola equipo")).toBeInTheDocument();
  });

  it("mirrors the selected conversation id into the URL", async () => {
    vi.mocked(listConversations).mockResolvedValue([makeConversation()]);
    vi.mocked(listMessages).mockResolvedValue([makeMessage()]);

    render(<ConversationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Ana/ }));

    expect(window.location.search).toContain("id=conv-1");
  });

  it("filters the inbox client-side by customer name", async () => {
    vi.mocked(listConversations).mockResolvedValue([
      makeConversation(),
      makeConversation({
        id: "conv-2",
        customer_id: "cust-2",
        customer_name: "Bruno",
        customer_phone: "+56933334444",
      }),
    ]);
    vi.mocked(listMessages).mockResolvedValue([makeMessage()]);

    render(<ConversationsPage />);
    await screen.findByRole("button", { name: /Ana/ });
    expect(screen.getByRole("button", { name: /Bruno/ })).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: /buscar/i }),
      "Bruno",
    );

    expect(screen.queryByRole("button", { name: /Ana/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bruno/ })).toBeInTheDocument();
  });
});

describe("ConversationsPage — el preview no se queda viejo", () => {
  it("refresca la fila cuando entra un mensaje, y conserva los no leídos", async () => {
    vi.mocked(listConversations).mockResolvedValue([
      makeConversation({ last_message_preview: "hola, tienen hora?", last_message_direction: "in" }),
    ]);
    vi.mocked(listMessages).mockResolvedValue([]);
    // Lo que el servidor devolverá al re-pedir la fila.
    vi.mocked(getConversation).mockResolvedValue(
      makeConversation({
        last_message_preview: "y para el sabado?",
        last_message_direction: "in",
        last_message_at: "2026-06-30T11:00:00Z",
      }),
    );

    render(<ConversationsPage />);
    expect(await screen.findByText("hola, tienen hora?")).toBeInTheDocument();

    emitSse({
      id: "e1",
      type: "mensaje_recibido",
      emitted_at: "2026-06-30T11:00:00Z",
      data: { conversation_id: "conv-1", customer_id: "cust-1", message_id: "m2" },
    } as SSEEvent);

    // El evento NO trae el texto (es PII), así que la página re-pide esa conversación. Sin
    // eso la fila salta a «Ahora» mostrando el mensaje ANTERIOR: hora nueva, texto viejo.
    expect(await screen.findByText("y para el sabado?")).toBeInTheDocument();
    expect(getConversation).toHaveBeenCalledWith("conv-1");
    // Y el contador de no leídos que el parche local subió no se pierde en el refetch
    // (el backend no expone `unread`: el mapper devuelve 0).
    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("también refresca cuando el que escribe es el motor de automatizaciones", async () => {
    vi.mocked(listConversations).mockResolvedValue([
      makeConversation({ last_message_preview: "hola", last_message_direction: "in" }),
    ]);
    vi.mocked(listMessages).mockResolvedValue([]);
    vi.mocked(getConversation).mockResolvedValue(
      makeConversation({
        last_message_preview: "Te recordamos tu cita de mañana",
        last_message_direction: "out",
        last_message_sender_kind: "system",
      }),
    );

    render(<ConversationsPage />);
    expect(await screen.findByText("hola")).toBeInTheDocument();

    emitSse({
      id: "e2",
      type: "mensaje_automatico_enviado",
      emitted_at: "2026-06-30T11:00:00Z",
      data: { conversation_id: "conv-1", customer_id: "cust-1", rule_code: "appointment_reminder" },
    } as SSEEvent);

    expect(await screen.findByText("Te recordamos tu cita de mañana")).toBeInTheDocument();
    // El prefijo «Automático:» lo cubre conversation-list.test.tsx sobre el texto de la
    // fila completa: como elemento suelto es frágil (vive en su propio span, pegado al texto).
  });
});
