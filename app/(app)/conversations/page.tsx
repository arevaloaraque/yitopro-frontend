"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare } from "lucide-react";

import {
  closeConversation,
  getConversation,
  listConversations,
  listMessages,
  reactivateAI,
  sendMessage,
  takeConversation,
} from "@/lib/api/conversations";
import { subscribeToEvents } from "@/lib/sse";
import { useAgents } from "@/lib/agents";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/utils";
import type {
  Conversation,
  ConversationStatus,
  ConversacionAsignadaEvent,
  ConversacionCerradaEvent,
  ConversacionEscaladaEvent,
  ConversacionReactivadaEvent,
  MensajeAutomaticoEnviadoEvent,
  MensajeRecibidoEvent,
  Message,
} from "@/lib/types";
import { EmptyState } from "@/components/states/empty-state";
import { cn } from "@/lib/utils";

import { ConversationDetail } from "./_components/conversation-detail";
import { ConversationList } from "./_components/conversation-list";

function ConversationsInner() {
  const { user } = useAuth();
  // Initial selection comes from the URL (?id=…) so it survives F5 and is
  // deep-linkable (from the dashboard, a shared link, etc.).
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">("all");
  const [retryKey, setRetryKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("id"),
  );

  const [messages, setMessages] = useState<Message[]>([]);
  // Which conversation `messages` belongs to. Loading is *derived* from this vs
  // selectedId, so it can never be left stuck true by a re-selection.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesRetryKey, setMessagesRetryKey] = useState(0);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { agents } = useAgents();
  const agentNames = useMemo(
    () => new Map(agents.map((a) => [a.id, a.name])),
    [agents],
  );

  const selectedIdRef = useRef(selectedId);
  const conversationsRef = useRef(conversations);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  });

  useEffect(() => {
    conversationsRef.current = conversations;
  });

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      listConversations(statusFilter === "all" ? {} : { status: statusFilter })
        .then((data) => {
          if (cancelled) return;
          setConversations(data);
          setError(null);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(
            err instanceof Error ? err : new Error("Error al cargar conversaciones"),
          );
          setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [statusFilter, retryKey]);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    const t = setTimeout(() => {
      listMessages(selectedId)
        .then((data) => {
          if (cancelled) return;
          setMessages(data);
          setMessagesError(null);
          setLoadedId(selectedId);
        })
        .catch((err) => {
          if (cancelled) return;
          // Mark the selection as "loaded" (with no messages) so the skeleton
          // clears even on error, rather than spinning forever; the error is
          // surfaced separately so it isn't confused with a genuinely empty thread.
          setMessages([]);
          setMessagesError(
            err instanceof Error ? err.message : "Error al cargar mensajes",
          );
          setLoadedId(selectedId);
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [selectedId, messagesRetryKey]);

  const handleRetry = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

  const handleRetryMessages = useCallback(() => {
    // Forces the skeleton back on (loadedId !== selectedId) while re-fetching.
    setLoadedId(null);
    setMessagesRetryKey((k) => k + 1);
  }, []);

  const handleSelect = useCallback((id: string) => {
    // Re-clicking the already-open conversation is a no-op: its messages are
    // already loaded (and kept live by SSE), so re-selecting would only risk
    // wiping them and getting stuck on the skeleton.
    if (id === selectedIdRef.current) return;
    setSelectedId(id);
    // Mirror the selection into the URL (deep-linkable, survives F5) without a
    // navigation/refetch — replaceState keeps the list and thread state intact.
    window.history.replaceState(null, "", `?id=${id}`);
    setActionError(null);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    );
  }, []);

  /**
   * Re-pide UNA conversación para refrescar su preview.
   *
   * Los eventos de realtime no traen el texto del mensaje a propósito: `apps/realtime`
   * publica solo ids y datos operativos, sin PII, y el mensaje de un cliente es PII. Así que
   * el preview no se puede parchear desde el payload. Sin esto la fila salta a «Ahora» y
   * sigue mostrando el mensaje ANTERIOR — un preview viejo con hora nueva es peor que no
   * tener preview.
   *
   * `unread` se preserva del estado local: el backend no lo expone (el mapper devuelve 0),
   * así que un refetch a secas borraría el contador que este mismo handler acaba de subir.
   */
  const refreshRow = useCallback((conversationId: string) => {
    getConversation(conversationId)
      .then((fresh) =>
        setConversations((prev) =>
          prev
            .map((c) => (c.id === conversationId ? { ...fresh, unread: c.unread } : c))
            .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = subscribeToEvents((event) => {
      switch (event.type) {
        case "mensaje_recibido": {
          const { conversation_id } = (event as MensajeRecibidoEvent).data;
          const exists = conversationsRef.current.some((c) => c.id === conversation_id);
          if (exists) {
            setConversations((prev) =>
              prev
                .map((c) =>
                  c.id === conversation_id
                    ? {
                        ...c,
                        last_message_at: event.emitted_at,
                        unread: c.id === selectedIdRef.current ? 0 : c.unread + 1,
                      }
                    : c,
                )
                .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
            );
            // El parche de arriba es feedback inmediato (hora + no leídos); el preview
            // necesita el servidor.
            refreshRow(conversation_id);
          } else {
            // Brand-new conversation (first message from a customer we don't
            // have in the inbox yet): fetch it and insert it instead of
            // silently dropping the event.
            getConversation(conversation_id)
              .then((conv) => {
                setConversations((prev) =>
                  prev.some((c) => c.id === conversation_id)
                    ? prev
                    : [...prev, conv].sort((a, b) =>
                        b.last_message_at.localeCompare(a.last_message_at),
                      ),
                );
              })
              .catch(() => {});
          }
          if (selectedIdRef.current === conversation_id) {
            listMessages(conversation_id)
              .then(setMessages)
              .catch(() => {});
          }
          break;
        }
        case "conversacion_asignada": {
          // An operator took or was reassigned the conversation.
          const { conversation_id, assignee_id } = (event as ConversacionAsignadaEvent)
            .data;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation_id
                ? { ...c, status: "human_handoff" as const, assignee_id }
                : c,
            ),
          );
          break;
        }
        case "conversacion_cerrada": {
          // The detail panel derives from `conversations`, so updating the
          // list here also reflects it in the open detail if selected.
          const { conversation_id } = (event as ConversacionCerradaEvent).data;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation_id ? { ...c, status: "closed" as const } : c,
            ),
          );
          break;
        }
        case "conversacion_escalada": {
          const { conversation_id } = (event as ConversacionEscaladaEvent).data;
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
        case "conversacion_reactivada": {
          // The AI regained the conversation (operator or inactivity timeout);
          // flip it back to ai_active and drop the human assignee so the panel
          // doesn't stay stuck on "Handoff".
          const { conversation_id } = (event as ConversacionReactivadaEvent).data;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation_id
                ? { ...c, status: "ai_active" as const, assignee_id: null }
                : c,
            ),
          );
          break;
        }
        case "mensaje_automatico_enviado": {
          // A scheduled/automated reply went out: reorder the inbox by activity
          // and, if that conversation is open, pull the new message into view.
          const { conversation_id } = (event as MensajeAutomaticoEnviadoEvent).data;
          setConversations((prev) => {
            const conv = prev.find((c) => c.id === conversation_id);
            if (!conv) return prev;
            return prev
              .map((c) =>
                c.id === conversation_id
                  ? { ...c, last_message_at: event.emitted_at }
                  : c,
              )
              .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
          });
          refreshRow(conversation_id);
          if (selectedIdRef.current === conversation_id) {
            listMessages(conversation_id)
              .then(setMessages)
              .catch(() => {});
          }
          break;
        }
      }
    });
    return unsub;
    // `refreshRow` es estable (useCallback sin deps): no re-suscribe el stream.
  }, [refreshRow]);

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
            .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
        );
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Error al enviar mensaje");
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
      setConversations((prev) => prev.map((c) => (c.id === selectedId ? updated : c)));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al tomar conversación",
      );
    }
  }, [selectedId]);

  const handleClose = useCallback(async () => {
    if (!selectedId) return;
    setActionError(null);
    try {
      const updated = await closeConversation(selectedId);
      setConversations((prev) => prev.map((c) => (c.id === selectedId ? updated : c)));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al cerrar conversación",
      );
    }
  }, [selectedId]);

  const handleReactivate = useCallback(async () => {
    if (!selectedId) return;
    setActionError(null);
    try {
      const updated = await reactivateAI(selectedId);
      setConversations((prev) => prev.map((c) => (c.id === selectedId ? updated : c)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al reactivar IA");
    }
  }, [selectedId]);

  const selectedConversation = selectedId
    ? (conversations.find((c) => c.id === selectedId) ?? null)
    : null;

  // Skeleton shows whenever the loaded messages don't belong to the current
  // selection (initial load or while switching). Re-clicking the same
  // conversation keeps loadedId === selectedId, so it never gets stuck.
  const loadingMessages = selectedId !== null && loadedId !== selectedId;

  return (
    <div className="-mx-6 -my-8 flex h-[calc(100vh-var(--spacing)*20)] md:-mx-12 md:-my-12">
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
            currentUserId={user?.id ?? null}
            onBack={() => {
              setSelectedId(null);
              window.history.replaceState(null, "", window.location.pathname);
            }}
            messages={messages}
            customerName={
              selectedConversation.customer_name.trim() ||
              formatNumber(selectedConversation.customer_phone)
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
            messagesError={messagesError}
            onRetryMessages={handleRetryMessages}
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

export default function ConversationsPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <ConversationsInner />
    </Suspense>
  );
}
