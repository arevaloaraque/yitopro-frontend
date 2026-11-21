"use client";

import { splitHighlight } from "@/lib/conversations/thread";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { timeOnly } from "@/lib/format/date";

interface MessageBubbleProps {
  message: Message;
  /** Término buscado, para resaltarlo. Vacío o ausente = sin resaltado. */
  highlight?: string;
  /** La coincidencia a la que se acaba de saltar: se marca, no solo se resalta. */
  active?: boolean;
}

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

function senderLabel(sender: Message["sender"]): string {
  switch (sender) {
    case "customer":
      return "Cliente";
    case "ai":
      return "IA";
    case "human":
      return "Operador";
    case "system":
      return "Sistema";
  }
}

export function MessageBubble({ message, highlight, active }: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";
  // El resaltado se aplica DESPUÉS de `stripTags`, y devuelve nodos: nunca
  // `dangerouslySetInnerHTML`. Esto es texto que escribió un cliente por WhatsApp.
  const limpio = stripTags(message.text);
  const tramos = highlight ? splitHighlight(limpio, highlight) : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 px-5 py-0.5",
        isOutbound ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          message.sender === "customer" && "rounded-bl-md bg-muted text-foreground",
          // "system" (automated messages) reuses the "ai" bubble style, just
          // with a different label below — no separate visual treatment.
          (message.sender === "ai" || message.sender === "system") &&
            "rounded-br-md bg-primary/10 text-foreground",
          message.sender === "human" &&
            "rounded-br-md bg-primary text-primary-foreground shadow-sm",
          // La coincidencia a la que se saltó: un anillo, no un color de fondo —
          // el fondo ya codifica quién escribió y pisarlo perdería ese dato.
          active && "ring-2 ring-accent ring-offset-2 ring-offset-background",
        )}
      >
        <span className="break-words whitespace-pre-wrap">
          {tramos
            ? tramos.map((t, i) =>
                t.hit ? (
                  <mark key={i} className="rounded-sm bg-accent/30 text-inherit">
                    {t.text}
                  </mark>
                ) : (
                  <span key={i}>{t.text}</span>
                ),
              )
            : limpio}
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-2">
        <span className="text-[10px] text-muted-foreground select-none">
          {senderLabel(message.sender)}
        </span>
        <span className="text-[10px] text-muted-foreground/50 select-none">
          {timeOnly(message.created_at)}
        </span>
      </div>
    </div>
  );
}
