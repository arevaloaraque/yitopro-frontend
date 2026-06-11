/** Estado de una conversación de WhatsApp. */
export type ConversationStatus = "ai_active" | "human_handoff" | "closed";

/** Conversación de WhatsApp con un cliente. Reflejo del schema `Conversation`. */
export interface Conversation {
  id: string;
  business_id: string;
  customer_id: string;
  status: ConversationStatus;
  /** Id del agente que atiende actualmente, o `null` si nadie. */
  active_agent: string | null;
  /** Intención detectada por la IA (p.ej. "agendar_cita"), o `null`. */
  detected_intent: string | null;
  /** ISO 8601 del último mensaje. */
  last_message_at: string;
  /** Cantidad de mensajes sin leer por el operador. */
  unread: number;
}
