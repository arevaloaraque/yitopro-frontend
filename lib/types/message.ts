/** Message direction relative to the business. */
export type MessageDirection = "inbound" | "outbound";

/** Who sent the message. */
export type MessageSender = "customer" | "ai" | "human";

/** Message delivery status. */
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

/** Message within a conversation. Mirror of the `Message` schema. */
export interface Message {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender: MessageSender;
  text: string;
  /** ISO 8601. */
  created_at: string;
  status: MessageStatus;
}
