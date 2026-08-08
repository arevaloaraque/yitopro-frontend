/** Status of a WhatsApp conversation. */
export type ConversationStatus = "ai_active" | "human_handoff" | "closed";

/** WhatsApp conversation with a customer. Mirror of the `Conversation` schema. */
export interface Conversation {
  id: string;
  customer_id: string;
  /** Nested customer's display name (may be blank; fall back to `customer_phone`). */
  customer_name: string;
  customer_phone: string;
  status: ConversationStatus;
  /** Id of the AI agent currently handling it, or `null` if no one. */
  active_agent: string | null;
  /** Id of the human operator who took it, or `null` if unclaimed. */
  assignee_id: string | null;
  /** ISO 8601 of the last message. */
  last_message_at: string;
  /** Number of messages unread by the operator. */
  unread: number;
  /** Behaviour rating (1-5) for THIS thread, or `null` when it has none. */
  customer_rating: number | null;
  /** Why a rating may be missing: "pending" | "rated" | "skipped" | "failed". */
  rating_status: string;
  /** The CUSTOMER's own aggregate — shown on a group header, not per thread. */
  customer_rating_avg: number | null;
  customer_rating_count: number;
  /** Last message of the thread, truncated server-side. "" when it has none yet. */
  last_message_preview: string;
  /** "in" | "out" | "" — which way the last message went. */
  last_message_direction: string;
  /** "" (customer) | "ai" | "operator" | "system" — who wrote it. */
  last_message_sender_kind: string;
}
