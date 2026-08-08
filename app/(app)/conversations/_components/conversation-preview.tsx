import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * WhatsApp-style one-liner of the thread's last message.
 *
 * The prefix is not decoration: in this inbox an outbound message may come from the
 * assistant, from an operator, or from the automation engine, and «Tú:» reads very
 * differently from the bot answering. WhatsApp uses a checkmark because there is only one
 * possible sender; here the sender is the information.
 *
 * Truncation is server-side (160 chars, `Substr` in SQL) — this only clamps to one line.
 */
const SENDER_PREFIX: Record<string, string> = {
  operator: "Tú: ",
  ai: "IA: ",
  system: "Automático: ",
};

export function ConversationPreview({
  conversation,
  className,
}: {
  conversation: Conversation;
  className?: string;
}) {
  const { last_message_preview: text, last_message_direction, last_message_sender_kind } =
    conversation;

  if (!text) {
    return (
      <span className={cn("truncate text-[0.7rem] text-muted-foreground/70 italic", className)}>
        Sin mensajes
      </span>
    );
  }
  // Inbound has no prefix: it is the customer, whose name is already on the row.
  const prefix = last_message_direction === "out" ? SENDER_PREFIX[last_message_sender_kind] : "";
  return (
    <span className={cn("truncate text-[0.7rem] text-muted-foreground", className)}>
      {prefix ? <span className="text-muted-foreground/70">{prefix}</span> : null}
      {text}
    </span>
  );
}
