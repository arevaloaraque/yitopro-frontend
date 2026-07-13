/**
 * ConversationDetail — take/handoff controls.
 *
 * The backend only lets an operator reply once the conversation is
 * `assigned_to_human` AND owned by that operator (it must be *taken* first).
 * So the "Tomar conversación" button has to be reachable while unclaimed, but
 * must disappear once the current operator owns it — otherwise it looks like
 * taking never finishes. The reply box follows the same ownership rule.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Conversation } from "@/lib/types";

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
    ...over,
  };
}

const noop = async () => {};

function renderDetail(conversation: Conversation, currentUserId: string | null = ME) {
  return render(
    <ConversationDetail
      conversation={conversation}
      currentUserId={currentUserId}
      messages={[]}
      customerName="Ana"
      agentName={null}
      onSendMessage={noop}
      onTake={noop}
      onClose={noop}
      onReactivate={noop}
      loadingMessages={false}
      messagesError={null}
      onRetryMessages={() => {}}
      sendingMessage={false}
      actionError={null}
      onDismissError={() => {}}
      onBack={() => {}}
    />,
  );
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
