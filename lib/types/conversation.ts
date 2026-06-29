/** Status of a WhatsApp conversation. */
export type ConversationStatus = "ai_active" | "human_handoff" | "closed";

/** WhatsApp conversation with a customer. Mirror of the `Conversation` schema. */
export interface Conversation {
  id: string;
  /** Not exposed by the backend (scoped per tenant); present only in mocks. */
  business_id?: string;
  customer_id: string;
  status: ConversationStatus;
  /** Id of the agent currently handling it, or `null` if no one. */
  active_agent: string | null;
  /** Intent detected by the AI (e.g. "agendar_cita"), or `null`. */
  detected_intent: string | null;
  /** ISO 8601 of the last message. */
  last_message_at: string;
  /** Number of messages unread by the operator. */
  unread: number;
}
