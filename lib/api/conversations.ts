import type { Conversation, ConversationStatus, Message } from "@/lib/types";

import { api } from "./client";

/**
 * Shapes reales del backend (Django Ninja). El mapeo a los tipos de UI vive
 * aquí; los componentes consumen `Conversation`/`Message` sin cambios.
 *
 * Diferencias clave:
 * - ids enteros (UI usa string); `customer` viene anidado (UI usa `customer_id`).
 * - status backend: open|waiting_customer|waiting_business|assigned_to_human|closed.
 * - `MessageOut` no trae `sender` ni `status`; `direction` es `in`/`out`.
 * - el backend no expone `detected_intent` ni un contador `unread`.
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
  content: string;
  created_at: string;
}

/** open/waiting_* => la IA atiende; assigned_to_human => handoff; closed => closed. */
function mapStatus(s: string): ConversationStatus {
  if (s === "assigned_to_human") return "human_handoff";
  if (s === "closed") return "closed";
  return "ai_active";
}

function convFromBackend(c: BackendConversation): Conversation {
  return {
    id: String(c.id),
    customer_id: String(c.customer.id),
    status: mapStatus(c.status),
    active_agent: c.active_agent || null,
    detected_intent: null, // no expuesto por el backend
    last_message_at: c.last_message_at ?? c.created_at,
    unread: 0, // no expuesto; el SSE `mensaje_recibido` lo incrementa en vivo
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
    // El backend no distingue ai/humano en salientes; al listar asumimos "ai".
    // Al responder manualmente (sendMessage) sabemos que es "human".
    sender: sender ?? (inbound ? "customer" : "ai"),
    text: m.content,
    created_at: m.created_at,
    status: "sent", // el backend no expone estado de entrega
  };
}

export interface ListConversationsParams {
  status?: ConversationStatus;
}

export async function listConversations(
  params: ListConversationsParams = {},
): Promise<Conversation[]> {
  // El backend filtra por su propio status. "human_handoff"/"closed" mapean 1:1;
  // "ai_active" abarca varios estados → traemos todo y filtramos en cliente.
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

/** Responde como operador humano. El backend exige que la conversación esté
 *  tomada por este operador (si no, responde 403). */
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

/** Devuelve el control a la IA. */
export function reactivateAI(id: string): Promise<Conversation> {
  return api
    .post<BackendConversation>(`/conversations/${id}/reactivate/`)
    .then(convFromBackend);
}
