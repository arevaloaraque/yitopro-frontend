import { setupWorker } from "msw/browser";

import { nextEventId, setMockEventGenerator } from "@/lib/sse";
import type { Appointment, Message, SSEEvent } from "@/lib/types";

import { db, genId } from "./data/store";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

const INBOUND_PREVIEWS = [
  "¿Tienen hora para hoy?",
  "¡Gracias! 🐾",
  "¿Cuánto cuesta el baño?",
  "Mi perrito necesita corte 🐶",
  "¿Atienden los domingos?",
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Genera un evento simulado leyendo el store. Alterna entre un mensaje
 * entrante de un cliente y una cita creada por la IA, mutando el store para
 * que el efecto sea visible al navegar.
 */
function generateMockEvent(): SSEEvent | null {
  const now = new Date().toISOString();
  const openConversations = db.conversations.filter((c) => c.status !== "closed");

  // 70%: mensaje entrante de un cliente.
  if (openConversations.length > 0 && Math.random() < 0.7) {
    const conversation = pick(openConversations);
    const preview = pick(INBOUND_PREVIEWS);
    const message: Message = {
      id: genId("msg"),
      conversation_id: conversation.id,
      direction: "inbound",
      sender: "customer",
      text: preview,
      created_at: now,
      status: "delivered",
    };
    db.messages.push(message);
    conversation.last_message_at = now;
    conversation.unread += 1;

    return {
      id: nextEventId(),
      type: "mensaje_recibido",
      emitted_at: now,
      data: {
        conversation_id: conversation.id,
        message_id: message.id,
        customer_id: conversation.customer_id,
        preview,
      },
    };
  }

  // 30%: cita creada por la IA.
  if (db.customers.length > 0 && db.services.length > 0) {
    const customer = pick(db.customers);
    const service = pick(db.services);
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + service.duration_minutes * 60 * 1000);
    const appointment: Appointment = {
      id: genId("apt"),
      business_id: customer.business_id,
      service_id: service.id,
      customer_id: customer.id,
      start: start.toISOString(),
      end: end.toISOString(),
      status: "scheduled",
      created_by: "ai",
      notes: null,
    };
    db.appointments.push(appointment);

    return {
      id: nextEventId(),
      type: "nueva_cita",
      emitted_at: now,
      data: {
        appointment_id: appointment.id,
        customer_id: appointment.customer_id,
        service_id: appointment.service_id,
        start: appointment.start,
        created_by: "ai",
      },
    };
  }

  return null;
}

/** Arranca el worker MSW y conecta el generador de eventos SSE simulados. */
export async function startMockWorker(): Promise<void> {
  setMockEventGenerator(generateMockEvent);
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: false,
  });
}
