/**
 * ConversationDetail — take/handoff controls.
 *
 * The backend only lets an operator reply once the conversation is
 * `assigned_to_human` AND owned by that operator (it must be *taken* first).
 * So the "Tomar conversación" button has to be reachable while unclaimed, but
 * must disappear once the current operator owns it — otherwise it looks like
 * taking never finishes. The reply box follows the same ownership rule.
 */
import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Conversation, Message } from "@/lib/types";

import { ConversationDetail } from "../_components/conversation-detail";

const ME = "u1";

function makeConversation(over: Partial<Conversation> = {}): Conversation {
  return {
    id: "1",
    customer_id: "c1",
    customer_name: "Ana",
    customer_phone: "+56911112222",
    status: "ai_active",
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

const noop = async () => {};

function renderDetail(
  conversation: Conversation,
  currentUserId: string | null = ME,
  over: Partial<ComponentProps<typeof ConversationDetail>> = {},
) {
  const props: ComponentProps<typeof ConversationDetail> = {
    conversation,
    currentUserId,
    messages: [],
    customerName: "Ana",
    agentName: null,
    onSendMessage: noop,
    onTake: noop,
    onClose: noop,
    onReactivate: noop,
    loadingMessages: false,
    messagesError: null,
    onRetryMessages: () => {},
    hasOlder: false,
    loadingOlder: false,
    onLoadOlder: () => {},
    sendingMessage: false,
    actionError: null,
    onDismissError: () => {},
    onBack: () => {},
    ...over,
  };
  const utils = render(<ConversationDetail {...props} />);
  return {
    ...utils,
    /** Re-renderiza con props nuevas, como haría la página al llegar más mensajes. */
    update: (next: Partial<ComponentProps<typeof ConversationDetail>>) =>
      utils.rerender(<ConversationDetail {...props} {...next} />),
  };
}

function makeMessage(id: string, text = id): Message {
  return {
    id,
    conversation_id: "1",
    direction: "inbound",
    sender: "customer",
    text,
    created_at: "2026-06-30T10:00:00Z",
  };
}

const takeButton = () => screen.queryByRole("button", { name: /Tomar/ });

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView (used by the message thread).
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("ConversationDetail — take controls", () => {
  it("offers 'Tomar' while the AI is active", () => {
    renderDetail(makeConversation({ status: "ai_active" }));
    expect(takeButton()).toBeInTheDocument();
  });

  it("offers 'Tomar' when handed off but not yet claimed", () => {
    renderDetail(makeConversation({ status: "human_handoff", assignee_id: null }));
    expect(takeButton()).toBeInTheDocument();
  });

  it("offers 'Tomar' when handed off to a different operator", () => {
    renderDetail(makeConversation({ status: "human_handoff", assignee_id: "u2" }));
    expect(takeButton()).toBeInTheDocument();
  });

  it("hides 'Tomar' once the current operator has taken it", () => {
    renderDetail(makeConversation({ status: "human_handoff", assignee_id: ME }));
    expect(takeButton()).not.toBeInTheDocument();
  });

  it("hides 'Tomar' once the conversation is closed", () => {
    renderDetail(makeConversation({ status: "closed" }));
    expect(takeButton()).not.toBeInTheDocument();
  });

  it("enables the reply box only for the operator who owns the conversation", () => {
    renderDetail(makeConversation({ status: "human_handoff", assignee_id: ME }));
    expect(screen.getByRole("textbox")).toBeEnabled();
  });

  it("keeps the reply box disabled while the conversation is unclaimed", () => {
    renderDetail(makeConversation({ status: "human_handoff", assignee_id: null }));
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});

describe("ConversationDetail — historia del hilo", () => {
  it("ofrece «Ver mensajes anteriores» solo cuando hay historia arriba", async () => {
    const onLoadOlder = vi.fn();
    const { unmount } = renderDetail(makeConversation(), ME, {
      messages: [makeMessage("m2")],
      hasOlder: true,
      onLoadOlder,
    });
    // Arriba, porque es de donde se tira la historia: el hilo abre en su página más nueva.
    await userEvent.click(screen.getByRole("button", { name: /mensajes anteriores/i }));
    expect(onLoadOlder).toHaveBeenCalled();

    unmount();
    renderDetail(makeConversation(), ME, { messages: [makeMessage("m2")] });
    expect(screen.queryByRole("button", { name: /mensajes anteriores/i })).toBeNull();
  });

  it("no baja al fondo al ANTEPONER historia, y sí cuando llega un mensaje nuevo", () => {
    const scroll = vi.mocked(window.HTMLElement.prototype.scrollIntoView);
    const nuevo = makeMessage("m2");
    const { update } = renderDetail(makeConversation(), ME, { messages: [nuevo] });
    const alAbrir = scroll.mock.calls.length;

    // Página de historia antepuesta: con `[messages]` como dependencia, el chat saltaba al
    // fondo justo al pedir lo que el operador quería leer.
    update({ messages: [makeMessage("m1"), nuevo] });
    expect(scroll.mock.calls.length).toBe(alAbrir);

    // Un mensaje nuevo al final sí baja: es el caso para el que existe el autoscroll.
    update({ messages: [makeMessage("m1"), nuevo, makeMessage("m3")] });
    expect(scroll.mock.calls.length).toBeGreaterThan(alAbrir);
  });
});
