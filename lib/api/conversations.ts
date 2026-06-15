import type { Conversation, Message, Paginated } from "@/lib/types";

import { api } from "./client";

export interface ListConversationsParams {
  status?: Conversation["status"];
}

export async function listConversations(
  params: ListConversationsParams = {},
): Promise<Conversation[]> {
  const res = await api.get<Paginated<Conversation>>("/conversations", {
    query: { ...params },
  });
  return res.items;
}

export function getConversation(id: string): Promise<Conversation> {
  return api.get<Conversation>(`/conversations/${id}`);
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const res = await api.get<Paginated<Message>>(
    `/conversations/${conversationId}/messages`,
  );
  return res.items;
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
