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
  }
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 px-4 py-0.5",
        isOutbound ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed",
          message.sender === "customer" && "bg-muted text-foreground",
          message.sender === "ai" && "bg-primary/10 text-foreground",
          message.sender === "human" &&
            "bg-primary text-primary-foreground",
        )}
      >
        <span className="whitespace-pre-wrap break-words">
          {stripTags(message.text)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-2">
        <span className="select-none text-[10px] text-muted-foreground">
          {senderLabel(message.sender)}
        </span>
        <span className="select-none text-[10px] text-muted-foreground/60">
          {formatTime(message.created_at)}
        </span>
        {message.status === "failed" && (
          <span className="select-none text-[10px] text-destructive">
            Error
          </span>
        )}
      </div>
    </div>
  );
}
