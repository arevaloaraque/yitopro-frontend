"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";

import { listAgents } from "@/lib/api/agents";
import {
  closeConversation,
  listConversations,
  listMessages,
  reactivateAI,
  sendMessage,
  takeConversation,
} from "@/lib/api/conversations";
import { listCustomers } from "@/lib/api/customers";
import { subscribeToEvents } from "@/lib/sse";
import type {
  Conversation,
  ConversationStatus,
  ConversacionEscaladaEvent,
  Customer,
  MensajeRecibidoEvent,
  Message,
} from "@/lib/types";
import { EmptyState } from "@/components/states/empty-state";
import { cn } from "@/lib/utils";

import { ConversationDetail } from "./_components/conversation-detail";
import { ConversationList } from "./_components/conversation-list";

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">(
    "all",
  );
  const [retryKey, setRetryKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [customerNames, setCustomerNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [agentNames, setAgentNames] = useState<Map<string, string>>(new Map());

  const selectedIdRef = useRef(selectedId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  });

  useEffect(() => {
    Promise.all([listCustomers(), listAgents()])
      .then(([customers, agents]) => {
        setCustomerNames(
          new Map(customers.map((c: Customer) => [c.id, c.name])),
        );
        setAgentNames(new Map(agents.map((a) => [a.id, a.name])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    listConversations(
      statusFilter === "all" ? {} : { status: statusFilter },
    )
      .then((data) => {
        if (cancelled) return;
        setConversations(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err
            : new Error("Error al cargar conversaciones"),
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [statusFilter, retryKey]);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;

    listMessages(selectedId)
      .then((data) => {
        if (cancelled) return;
        setMessages(data);
        setLoadingMessages(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMessages([]);
        setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleRetry = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setActionError(null);
    setMessages([]);
    setLoadingMessages(true);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    );
  }, []);

  useEffect(() => {
    const unsub = subscribeToEvents((event) => {
      switch (event.type) {
        case "mensaje_recibido": {
          const { conversation_id } = (
            event as MensajeRecibidoEvent
          ).data;
          setConversations((prev) => {
            const conv = prev.find((c) => c.id === conversation_id);
            if (!conv) return prev;
            return prev
              .map((c) =>
                c.id === conversation_id
                  ? {
                      ...c,
                      last_message_at: event.emitted_at,
                      unread:
                        c.id === selectedIdRef.current ? 0 : c.unread + 1,
                    }
                  : c,
              )
              .sort((a, b) =>
                b.last_message_at.localeCompare(a.last_message_at),
              );
          });
          if (selectedIdRef.current === conversation_id) {
            listMessages(conversation_id)
              .then(setMessages)
              .catch(() => {});
          }
          break;
        }
        case "conversacion_escalada": {
          const { conversation_id } = (
            event as ConversacionEscaladaEvent
          ).data;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation_id
                ? {
                    ...c,
                    status: "human_handoff" as const,
                    active_agent: null,
                  }
                : c,
            ),
          );
          break;
        }
      }
    });
    return unsub;
  }, []);

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!selectedId) return;
      setSendingMessage(true);
      setActionError(null);
      try {
        const msg = await sendMessage(selectedId, text);
        setMessages((prev) => [...prev, msg]);
        setConversations((prev) =>
          prev
            .map((c) =>
              c.id === selectedId
                ? { ...c, last_message_at: msg.created_at, unread: 0 }
                : c,
            )
            .sort((a, b) =>
              b.last_message_at.localeCompare(a.last_message_at),
            ),
        );
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Error al enviar mensaje",
        );
      } finally {
        setSendingMessage(false);
      }
    },
    [selectedId],
  );

  const handleTake = useCallback(async () => {
    if (!selectedId) return;
    setActionError(null);
    try {
      const updated = await takeConversation(selectedId);
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? updated : c)),
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Error al tomar conversación",
      );
    }
  }, [selectedId]);

  const handleClose = useCallback(async () => {
    if (!selectedId) return;
    setActionError(null);
    try {
      const updated = await closeConversation(selectedId);
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? updated : c)),
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Error al cerrar conversación",
      );
    }
  }, [selectedId]);

  const handleReactivate = useCallback(async () => {
    if (!selectedId) return;
    setActionError(null);
    try {
      const updated = await reactivateAI(selectedId);
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? updated : c)),
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al reactivar IA",
      );
    }
  }, [selectedId]);

  const selectedConversation =
    selectedId
      ? conversations.find((c) => c.id === selectedId) ?? null
      : null;

  return (
    <div className="-my-8 -mx-6 flex h-[calc(100vh-var(--spacing)*20)] md:-my-12 md:-mx-12">
      {/* Left panel — Inbox. On mobile it takes the full width; it hides when
          a conversation is opened (master-detail pattern). On desktop always visible. */}
      <div
        className={cn(
          "w-full shrink-0 border-r border-border/60 bg-card lg:w-96",
          selectedId && "hidden lg:block",
        )}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={handleSelect}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          loading={loading}
          error={error}
          onRetry={handleRetry}
          customerNames={customerNames}
          agentNames={agentNames}
        />
      </div>

      {/* Right panel — Detail. On mobile it only shows when selected; on
          desktop it takes the remaining space. min-w-0 allows it to shrink. */}
      <div
        className={cn(
          "min-w-0 flex-1 flex-col bg-background",
          selectedId ? "flex" : "hidden lg:flex",
        )}
      >
        {selectedConversation ? (
          <ConversationDetail
            conversation={selectedConversation}
            onBack={() => setSelectedId(null)}
            messages={messages}
            customerName={
              customerNames.get(selectedConversation.customer_id) ??
              selectedConversation.customer_id
            }
            agentName={
              selectedConversation.active_agent
                ? (agentNames.get(selectedConversation.active_agent) ??
                  selectedConversation.active_agent)
                : null
            }
            onSendMessage={handleSendMessage}
            onTake={handleTake}
            onClose={handleClose}
            onReactivate={handleReactivate}
            loadingMessages={loadingMessages}
            sendingMessage={sendingMessage}
            actionError={actionError}
            onDismissError={() => setActionError(null)}
          />
        ) : (
          <EmptyState
            title="Selecciona una conversación"
            description="Elige una conversación de la bandeja para ver los mensajes."
            icon={MessageSquare}
            className="m-auto border-none bg-transparent"
          />
        )}
      </div>
    </div>
  );
}
