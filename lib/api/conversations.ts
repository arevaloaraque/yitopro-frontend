import type { Conversation, Message } from "@/lib/types";

import { api } from "./client";

export interface ListConversationsParams {
  status?: Conversation["status"];
}

export function listConversations(
  params: ListConversationsParams = {},
): Promise<Conversation[]> {
  return api.get<Conversation[]>("/conversations", { query: { ...params } });
}

export function getConversation(id: string): Promise<Conversation> {
  return api.get<Conversation>(`/conversations/${id}`);
}

export function listMessages(conversationId: string): Promise<Message[]> {
  return api.get<Message[]>(`/conversations/${conversationId}/messages`);
}

/** Envía un mensaje saliente como operador humano. */
export function sendMessage(conversationId: string, text: string): Promise<Message> {
  return api.post<Message>(`/conversations/${conversationId}/messages`, {
    text,
  });
}

/** El operador toma la conversación (handoff humano). */
export function takeConversation(id: string): Promise<Conversation> {
  return api.post<Conversation>(`/conversations/${id}/take`);
}

export function closeConversation(id: string): Promise<Conversation> {
  return api.post<Conversation>(`/conversations/${id}/close`);
}

/** Devuelve el control a la IA. */
export function reactivateAI(id: string): Promise<Conversation> {
  return api.post<Conversation>(`/conversations/${id}/reactivate`);
}
