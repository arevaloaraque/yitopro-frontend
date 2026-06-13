"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { Loading } from "@/components/states/loading";
import type { Conversation, Message } from "@/lib/types";

import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";

interface ConversationDetailProps {
  conversation: Conversation;
  messages: Message[];
  customerName: string;
  agentName: string | null;
  onSendMessage: (text: string) => Promise<void>;
  onTake: () => Promise<void>;
  onClose: () => Promise<void>;
  onReactivate: () => Promise<void>;
  loadingMessages: boolean;
  sendingMessage: boolean;
  actionError: string | null;
  onDismissError: () => void;
}

function statusLabel(status: Conversation["status"]): string {
  switch (status) {
    case "ai_active":
      return "IA Activo";
    case "human_handoff":
      return "Handoff Humano";
    case "closed":
      return "Cerrado";
  }
}

function statusVariant(
  status: Conversation["status"],
): "default" | "secondary" | "outline" {
  switch (status) {
    case "ai_active":
      return "default";
    case "human_handoff":
      return "secondary";
    case "closed":
      return "outline";
  }
}

export function ConversationDetail({
  conversation,
  messages,
  customerName,
  agentName,
  onSendMessage,
  onTake,
  onClose,
  onReactivate,
  loadingMessages,
  sendingMessage,
  actionError,
  onDismissError,
}: ConversationDetailProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isHandoff = conversation.status === "human_handoff";
  const isClosed = conversation.status === "closed";
  const isAiActive = conversation.status === "ai_active";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{customerName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge
                variant={statusVariant(conversation.status)}
                className="h-5 text-[11px]"
              >
                {statusLabel(conversation.status)}
              </Badge>
              {conversation.detected_intent && (
                <Badge variant="outline" className="h-5 text-[11px]">
                  {conversation.detected_intent.replace(/_/g, " ")}
                </Badge>
              )}
              {agentName && (
                <span className="text-xs text-muted-foreground">
                  {agentName}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            {isAiActive && (
              <Button variant="secondary" size="xs" onClick={onTake}>
                Tomar conversación
              </Button>
            )}
            {isHandoff && (
              <Button variant="outline" size="xs" onClick={onReactivate}>
                Reactivar IA
              </Button>
            )}
            {!isClosed && (
              <Button variant="outline" size="xs" onClick={onClose}>
                Cerrar
              </Button>
            )}
          </div>
        </div>
        {actionError && (
          <div
            role="alert"
            className="mt-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
          >
            <AlertCircle className="size-3 shrink-0" />
            <span className="flex-1">{actionError}</span>
            <button
              type="button"
              onClick={onDismissError}
              className="ml-auto shrink-0 hover:text-destructive/80"
              aria-label="Cerrar error"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3">
        {loadingMessages ? (
          <Loading rows={5} className="px-4" />
        ) : messages.length === 0 ? (
          <EmptyState
            title="Sin mensajes"
            description="Esta conversación no tiene mensajes aún."
            icon={MessageSquare}
            className="m-4 border-none bg-transparent"
          />
        ) : (
          <div className="space-y-0.5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <MessageInput
        disabled={!isHandoff}
        disabledMessage={
          isClosed
            ? "Esta conversación está cerrada."
            : "La IA está atendiendo. Toma la conversación para responder."
        }
        sending={sendingMessage}
        onSubmit={onSendMessage}
      />
    </div>
  );
}
