import { http, HttpResponse } from "msw";

import type { Message } from "@/lib/types";

import { db, genId } from "../data/store";
import { API, badRequest, notFound } from "./util";

export const conversationHandlers = [
  http.get(`${API}/conversations`, ({ request }) => {
    const status = new URL(request.url).searchParams.get("status");
    let result = db.conversations;
    if (status) result = result.filter((c) => c.status === status);
    // Más recientes primero.
    result = [...result].sort((a, b) =>
      b.last_message_at.localeCompare(a.last_message_at),
    );
    return HttpResponse.json({ items: result, count: result.length });
  }),

  http.get(`${API}/conversations/:id`, ({ params }) => {
    const conversation = db.conversations.find((c) => c.id === params.id);
    if (!conversation) return notFound();
    return HttpResponse.json(conversation);
  }),

  http.get(`${API}/conversations/:id/messages`, ({ params }) => {
    const conversation = db.conversations.find((c) => c.id === params.id);
    if (!conversation) return notFound();
    const messages = db.messages
      .filter((m) => m.conversation_id === params.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return HttpResponse.json({ items: messages, count: messages.length });
  }),

  http.post(`${API}/conversations/:id/messages`, async ({ params, request }) => {
    const conversation = db.conversations.find((c) => c.id === params.id);
    if (!conversation) return notFound();
    if (conversation.status !== "human_handoff") {
      return badRequest("Solo puedes responder en conversaciones en modo handoff.");
    }
    const { text } = (await request.json()) as { text: string };
    const now = new Date().toISOString();

    const message: Message = {
      id: genId("msg"),
      conversation_id: conversation.id,
      direction: "outbound",
      sender: "human",
      text,
      created_at: now,
      status: "sent",
    };
    db.messages.push(message);
    conversation.last_message_at = now;
    // El operador está leyendo: ya no hay sin leer.
    conversation.unread = 0;

    return HttpResponse.json(message, { status: 201 });
  }),

  http.post(`${API}/conversations/:id/take`, ({ params }) => {
    const conversation = db.conversations.find((c) => c.id === params.id);
    if (!conversation) return notFound();
    if (conversation.status !== "ai_active") {
      return badRequest("Solo puedes tomar conversaciones atendidas por la IA.");
    }
    conversation.status = "human_handoff";
    conversation.active_agent = null;
    conversation.unread = 0;
    return HttpResponse.json(conversation);
  }),

  http.post(`${API}/conversations/:id/close`, ({ params }) => {
    const conversation = db.conversations.find((c) => c.id === params.id);
    if (!conversation) return notFound();
    if (conversation.status === "closed") {
      return badRequest("La conversación ya está cerrada.");
    }
    conversation.status = "closed";
    conversation.active_agent = null;
    return HttpResponse.json(conversation);
  }),

  http.post(`${API}/conversations/:id/reactivate`, ({ params }) => {
    const conversation = db.conversations.find((c) => c.id === params.id);
    if (!conversation) return notFound();
    if (conversation.status !== "human_handoff") {
      return badRequest("Solo puedes reactivar la IA en conversaciones en handoff.");
    }
    conversation.status = "ai_active";
    conversation.active_agent = "agent_orchestrator";
    return HttpResponse.json(conversation);
  }),
];
