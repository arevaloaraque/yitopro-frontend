"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, ChevronLeft, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Loading } from "@/components/states/loading";
import type { Conversation, Message } from "@/lib/types";

import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";

interface ConversationDetailProps {
  conversation: Conversation;
  /** Current operator's id, to tell "taken by me" from "unclaimed / someone else". */
  currentUserId: string | null;
  messages: Message[];
  customerName: string;
  agentName: string | null;
  onSendMessage: (text: string) => Promise<void>;
  onTake: () => Promise<void>;
  onClose: () => Promise<void>;
  onReactivate: () => Promise<void>;
  loadingMessages: boolean;
  /** Set when the message thread failed to load; shows a retry state instead
   *  of misreporting the thread as genuinely empty. */
  messagesError: string | null;
  onRetryMessages: () => void;
  /** Hay historia MÁS VIEJA arriba de lo que se está viendo (el hilo llega paginado). */
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  sendingMessage: boolean;
  actionError: string | null;
  onDismissError: () => void;
  /** Returns to the inbox in the mobile view (master-detail). */
  onBack: () => void;
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

function statusVariant(status: Conversation["status"]): "info" | "warning" | "outline" {
  switch (status) {
    case "ai_active":
      return "info";
    case "human_handoff":
      return "warning";
    case "closed":
      return "outline";
  }
}

export function ConversationDetail({
  conversation,
  currentUserId,
  messages,
  customerName,
  agentName,
  onSendMessage,
  onTake,
  onClose,
  onReactivate,
  loadingMessages,
  messagesError,
  onRetryMessages,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  sendingMessage,
  actionError,
  onDismissError,
  onBack,
}: ConversationDetailProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Se baja al fondo cuando cambia el ÚLTIMO mensaje, no con cualquier cambio del array:
  // «Ver mensajes anteriores» antepone una página, y con `[messages]` el chat saltaba al
  // fondo justo al pedir la historia que el operador quería leer.
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastMessageId]);

  const isHandoff = conversation.status === "human_handoff";
  const isClosed = conversation.status === "closed";
  // "Mine" = handed off and assigned to me. Only then can I reply (backend 403s
  // otherwise); taking is what claims it, so the button hides once it's mine.
  const isMine =
    conversation.assignee_id !== null && conversation.assignee_id === currentUserId;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border/60 bg-background/50 px-5 py-3.5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="-ml-1 shrink-0 lg:hidden"
              onClick={onBack}
              aria-label="Volver a la bandeja"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{customerName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge
                  variant={statusVariant(conversation.status)}
                  className="h-5 text-[11px]"
                >
                  {statusLabel(conversation.status)}
                </Badge>
                {agentName ? (
                  <span className="text-[0.7rem] text-muted-foreground">
                    {agentName}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {/* Claimable until it's mine: shown while the AI owns it and while
                handed off to no-one / another operator, hidden once I've taken
                it (backend only lets the assignee reply). */}
            {!isClosed && !isMine ? (
              <Button variant="secondary" size="xs" onClick={onTake}>
                Tomar conversación
              </Button>
            ) : null}
            {isHandoff ? (
              <Button variant="outline" size="xs" onClick={onReactivate}>
                Reactivar IA
              </Button>
            ) : null}
            {!isClosed ? (
              <Button variant="outline" size="xs" onClick={onClose}>
                Cerrar
              </Button>
            ) : null}
          </div>
        </div>
        {actionError ? (
          <div
            role="alert"
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[0.7rem] text-destructive"
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
        ) : null}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3">
        {loadingMessages ? (
          <Loading rows={5} className="px-4" />
        ) : messagesError ? (
          <ErrorState
            title="No se pudieron cargar los mensajes"
            description={messagesError}
            onRetry={onRetryMessages}
            className="m-4 border-none bg-transparent"
          />
        ) : messages.length === 0 ? (
          <EmptyState
            title="Sin mensajes"
            description="Esta conversación no tiene mensajes aún."
            icon={MessageSquare}
            className="m-4 border-none bg-transparent"
          />
        ) : (
          <div className="space-y-0.5">
            {/* Arriba, porque es donde está la historia: el hilo abre en su página más
                nueva y se sube a pedir lo anterior. */}
            {hasOlder ? (
              <div className="flex justify-center pb-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={onLoadOlder}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? "Cargando…" : "Ver mensajes anteriores"}
                </Button>
              </div>
            ) : null}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <MessageInput
        disabled={!isMine}
        disabledMessage={
          isClosed
            ? "Esta conversación está cerrada."
            : "Toma la conversación para responder."
        }
        sending={sendingMessage}
        onSubmit={onSendMessage}
      />
    </div>
  );
}
