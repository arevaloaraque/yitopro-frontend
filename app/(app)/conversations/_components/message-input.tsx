"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface MessageInputProps {
  disabled: boolean;
  disabledMessage: string;
  sending: boolean;
  onSubmit: (text: string) => Promise<void>;
}

export function MessageInput({
  disabled,
  disabledMessage,
  sending,
  onSubmit,
}: MessageInputProps) {
  const [text, setText] = useState("");

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || disabled || sending) return;
    await onSubmit(trimmed);
    setText("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="shrink-0 border-t border-border p-3">
      {disabled && (
        <p className="mb-2 text-center text-xs text-muted-foreground">
          {disabledMessage}
        </p>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled ? "Respuesta deshabilitada" : "Escribe un mensaje…"
          }
          disabled={disabled || sending}
          className="min-h-10 resize-none"
          rows={1}
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={disabled || sending || !text.trim()}
          className="shrink-0"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
