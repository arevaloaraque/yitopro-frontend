/** Dirección del mensaje respecto del negocio. */
export type MessageDirection = "inbound" | "outbound";

/** Quién envió el mensaje. */
export type MessageSender = "customer" | "ai" | "human";

/** Estado de entrega del mensaje. */
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

/** Mensaje dentro de una conversación. Reflejo del schema `Message`. */
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
