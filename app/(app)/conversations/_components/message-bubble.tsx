"use client";

import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: Message;
}

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";

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
        )}
      >
        <span className="break-words whitespace-pre-wrap">
          {stripTags(message.text)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-2">
        <span className="text-[10px] text-muted-foreground select-none">
          {senderLabel(message.sender)}
        </span>
        <span className="text-[10px] text-muted-foreground/50 select-none">
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  );
}
