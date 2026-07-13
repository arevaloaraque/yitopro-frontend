import type { Conversation, ConversationStatus, Message } from "@/lib/types";

import { api } from "./client";

/**
 * Actual backend shapes (Django Ninja). The mapping to the UI types lives
 * here; components consume `Conversation`/`Message` unchanged.
 *
 * Key differences:
 * - integer ids (UI uses string); `customer` comes nested (UI uses `customer_id`,
 *   plus `customer_name`/`customer_phone` for display).
 * - backend status: open|waiting_customer|waiting_business|assigned_to_human|closed.
 * - `MessageOut` carries `sender_kind` ("ai"|"operator"|"system" for outbound, ""
 *   for inbound) instead of `sender`; `direction` is `in`/`out`.
 * - the backend does not expose an `unread` counter.
 */
interface BackendConversation {
  id: number;
  status: string;
  channel_type: string;
  active_agent: string;
  customer: { id: number; display_name: string; phone: string };
  assignee_id: number | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BackendMessage {
  id: number;
  direction: string; // "in" | "out"
  sender_kind: string; // "ai" | "operator" | "system" for outbound; "" for inbound
  content: string;
  created_at: string;
}

/** open/waiting_* => the AI handles it; assigned_to_human => handoff; closed => closed. */
function mapStatus(s: string): ConversationStatus {
  if (s === "assigned_to_human") return "human_handoff";
  if (s === "closed") return "closed";
  return "ai_active";
}

function convFromBackend(c: BackendConversation): Conversation {
  return {
    id: String(c.id),
    customer_id: String(c.customer.id),
    customer_name: c.customer.display_name,
    customer_phone: c.customer.phone,
    status: mapStatus(c.status),
    active_agent: c.active_agent || null,
    assignee_id: c.assignee_id === null ? null : String(c.assignee_id),
    last_message_at: c.last_message_at ?? c.created_at,
    unread: 0, // not exposed; the SSE `mensaje_recibido` increments it live
  };
}

function msgFromBackend(
  m: BackendMessage,
  conversationId: string,
  sender?: Message["sender"],
): Message {
  const inbound = m.direction === "in";
  return {
    id: String(m.id),
    conversation_id: conversationId,
    direction: inbound ? "inbound" : "outbound",
    // sendMessage already knows the sender ("human"); otherwise derive it from
    // sender_kind: "operator" -> human, "system" -> system, else ("ai") -> ai.
    sender:
      sender ??
      (inbound
        ? "customer"
        : m.sender_kind === "operator"
          ? "human"
          : m.sender_kind === "system"
            ? "system"
            : "ai"),
    text: m.content,
    created_at: m.created_at,
  };
}

export interface ListConversationsParams {
  status?: ConversationStatus;
}

export async function listConversations(
  params: ListConversationsParams = {},
): Promise<Conversation[]> {
  // The backend filters by its own status. "human_handoff"/"closed" map 1:1;
  // "ai_active" spans several states → we fetch everything and filter client-side.
  const backendStatus =
    params.status === "human_handoff"
      ? "assigned_to_human"
      : params.status === "closed"
        ? "closed"
        : undefined;
  const res = await api.get<BackendConversation[]>("/conversations/", {
    query: backendStatus ? { status: backendStatus } : {},
  });
  const mapped = res.map(convFromBackend);
  return params.status === "ai_active"
    ? mapped.filter((c) => c.status === "ai_active")
    : mapped;
}

export function getConversation(id: string): Promise<Conversation> {
  return api.get<BackendConversation>(`/conversations/${id}/`).then(convFromBackend);
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const res = await api.get<BackendMessage[]>(
    `/conversations/${conversationId}/messages/`,
  );
  return res.map((m) => msgFromBackend(m, conversationId));
}

/** Replies as a human operator. The backend requires that the conversation be
 *  taken by this operator (otherwise it responds 403). */
export function sendMessage(conversationId: string, text: string): Promise<Message> {
  return api
    .post<BackendMessage>(`/conversations/${conversationId}/messages/`, {
      content: text,
    })
    .then((m) => msgFromBackend(m, conversationId, "human"));
}

export function takeConversation(id: string): Promise<Conversation> {
  return api
    .post<BackendConversation>(`/conversations/${id}/take/`)
    .then(convFromBackend);
}

export function closeConversation(id: string): Promise<Conversation> {
  return api
    .post<BackendConversation>(`/conversations/${id}/close/`)
    .then(convFromBackend);
}

/** Returns control to the AI. */
export function reactivateAI(id: string): Promise<Conversation> {
  return api
    .post<BackendConversation>(`/conversations/${id}/reactivate/`)
    .then(convFromBackend);
}
