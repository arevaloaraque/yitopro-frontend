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
  type MessagePage,
} from "@/lib/api/conversations";
import { subscribeToEvents } from "@/lib/sse";
import { useAgents } from "@/lib/agents";
import { useAuth } from "@/lib/auth";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { formatNumber } from "@/lib/utils";
import type { CustomerSelection } from "@/components/customers/customer-combobox";
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
import { ConversationList, type InboxView } from "./_components/conversation-list";

/** Lo que viaja en la URL. Lo que vale el default no se escribe (ver `useUrlFilters`). */
const FILTER_DEFAULTS = { status: "all", q: "", view: "thread" };

/**
 * La URL la escribe cualquiera. Un `?status=lol` pegado a mano no debe dejar la bandeja sin
 * ninguna pestaña marcada ni mandarle al backend un estado que no existe: lo desconocido cae
 * al default.
 */
function asStatusFilter(raw: string): ConversationStatus | "all" {
  return raw === "ai_active" || raw === "human_handoff" || raw === "closed"
    ? raw
    : "all";
}

function asView(raw: string): InboxView {
  return raw === "number" ? "number" : "thread";
}

/** Escribe (o borra, con `null`) UNA clave de la query sin tocar las demás. */
function setSearchParam(key: string, value: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (value === null) params.delete(key);
  else params.set(key, value);
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

/**
 * Coalescing de los refetch que dispara el SSE.
 *
 * Un cliente que escribe cinco líneas seguidas emite cinco `mensaje_recibido`, y cada uno
 * volvía a bajar el hilo más la fila. Ahora el hilo viene paginado (la página más nueva),
 * así que el refetch está acotado; lo que sigue haciendo falta es que una ráfaga cueste una
 * request y no N. Pedir SOLO los mensajes nuevos necesitaría un `after=` que el backend no
 * expone: `before=` sirve para subir a la historia, no para completar la cola.
 */
const SSE_COALESCE_MS = 250;

/**
 * DECISIÓN: el refetch del SSE MERGEA la cola, no reemplaza el hilo.
 *
 * Ese refetch trae la página MÁS NUEVA. Si el operador había pulsado «Ver mensajes
 * anteriores» para leer historia, reemplazar el hilo le tira las páginas que pidió y el chat
 * salta al fondo justo mientras lee — y basta un mensaje entrante para que pase. Mergear
 * conserva lo que hay y añade solo lo que no se tenía.
 *
 * El caso raro está cubierto: si la página nueva no solapa con NINGÚN mensaje en pantalla,
 * entraron más mensajes que el tamaño de página y mergear dejaría un hueco invisible en
 * medio del chat; ahí sí se reemplaza, y `has_more` vuelve a describir el hilo. Se compara
 * por id, no por posición ni por id mayor: los ids no van en orden de tiempo para filas
 * insertadas con fecha atrasada (lo dice el propio backend al resolver `before`).
 */
function mergeNewMessages(
  prev: Message[],
  page: MessagePage,
): { messages: Message[]; replaced: boolean } {
  const known = new Set(prev.map((m) => m.id));
  if (!page.items.some((m) => known.has(m.id)))
    return { messages: page.items, replaced: true };
  const nuevos = page.items.filter((m) => !known.has(m.id));
  return { messages: nuevos.length ? [...prev, ...nuevos] : prev, replaced: false };
}

function ConversationsInner() {
  const { user } = useAuth();
  // Initial selection comes from the URL (?id=…) so it survives F5 and is
  // deep-linkable (from the dashboard, a shared link, etc.).
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("id"),
  );

  // Estado, término y vista viven en la URL: una bandeja filtrada se comparte y sobrevive un
  // F5. El hook preserva las claves que no gestiona, así que el `?id=` del hilo abierto no se
  // pierde al filtrar.
  const [filters, setFilters] = useUrlFilters(FILTER_DEFAULTS);
  const statusFilter = asStatusFilter(filters.status);
  const view = asView(filters.view);

  // El input va sin retraso; lo retrasado es el término con el que se CONSULTA (y con el que
  // se escribe la URL, que era un `replaceState` por pulsación). Ahora el buscador es de
  // servidor: `filters.q` es la única copia del término, así que la petición se deriva de él
  // y no puede desincronizarse de lo que dice la URL.
  const [search, setSearch] = useState(() => filters.q);
  const debouncedSearch = useDebounced(search);
  useEffect(() => {
    setFilters({ q: debouncedSearch.trim() });
  }, [debouncedSearch, setFilters]);
  const searchTerm = filters.q;

  // Filtro de SERVIDOR (`?customer_id=`): a diferencia del buscador, sí alcanza el historial
  // completo de esa persona. No va a la URL porque el combobox necesita el nombre para
  // dibujarse y el id solo no lo trae.
  const [customer, setCustomer] = useState<CustomerSelection>(null);
  const customerId = customer?.id ?? null;

  // Paginación por cursor. El cursor es OPACO: se guarda y se devuelve tal cual.
  const [cursor, setCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  // Which conversation `messages` belongs to. Loading is *derived* from this vs
  // selectedId, so it can never be left stuck true by a re-selection.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesRetryKey, setMessagesRetryKey] = useState(0);
  // «Hay historia MÁS VIEJA arriba» — no «faltan mensajes nuevos».
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { agents } = useAgents();
  const agentNames = useMemo(
    () => new Map(agents.map((a) => [a.id, a.name])),
    [agents],
  );

  const selectedIdRef = useRef(selectedId);
  const conversationsRef = useRef(conversations);
  const customerIdRef = useRef(customerId);
  // El merge del refetch necesita leer el hilo vigente FUERA de un updater de estado (un
  // updater tiene que ser puro, y aquí hay que decidir además si `hasOlder` cambia).
  const messagesRef = useRef(messages);
  // Coalescing del SSE: una ráfaga de eventos se cobra una request, no N.
  const pendingRowsRef = useRef<Set<string>>(new Set());
  const rowsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const threadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  });

  useEffect(() => {
    conversationsRef.current = conversations;
  });

  useEffect(() => {
    customerIdRef.current = customerId;
  });

  useEffect(() => {
    messagesRef.current = messages;
  });

  /**
   * Los tres filtros van al SERVIDOR. El buscador incluido: recortar en el navegador sobre
   * una lista paginada mostraría «lo que coincide de las 25 filas que bajé», que es un
   * filtro que miente.
   */
  const listParams = useMemo(
    () => ({
      ...(statusFilter === "all" ? {} : { status: statusFilter }),
      ...(customerId ? { customerId } : {}),
      ...(searchTerm ? { search: searchTerm } : {}),
    }),
    [statusFilter, customerId, searchTerm],
  );

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      listConversations(listParams)
        .then((page) => {
          if (cancelled) return;
          setConversations(page.items);
          setCursor(page.next_cursor);
          setHasMore(page.has_more);
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
  }, [listParams, retryKey]);

  const handleLoadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    listConversations(listParams, { cursor })
      .then((page) => {
        // Se descartan los ids que ya están: el SSE pudo haber insertado arriba una fila que
        // también viene en esta página, y dos filas con la misma key es un React key duplicado.
        setConversations((prev) => {
          const known = new Set(prev.map((c) => c.id));
          return [...prev, ...page.items.filter((c) => !known.has(c.id))];
        });
        setCursor(page.next_cursor);
        setHasMore(page.has_more);
      })
      .catch(() => {
        // NO va a `error`: ese estado dibuja el `ErrorState` en lugar de la lista, así que
        // fallar al pedir la página 2 borraría de la pantalla la página 1 que el operador
        // estaba leyendo. Va al pie, junto al botón con el que se reintenta.
        setMoreError("No se pudo cargar la página siguiente.");
      })
      .finally(() => setLoadingMore(false));
  }, [cursor, listParams, loadingMore]);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    const t = setTimeout(() => {
      listMessages(selectedId)
        .then((page) => {
          if (cancelled) return;
          setMessages(page.items);
          setHasOlder(page.has_more);
          setMessagesError(null);
          setLoadedId(selectedId);
        })
        .catch((err) => {
          if (cancelled) return;
          // Mark the selection as "loaded" (with no messages) so the skeleton
          // clears even on error, rather than spinning forever; the error is
          // surfaced separately so it isn't confused with a genuinely empty thread.
          setMessages([]);
          setHasOlder(false);
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

  /** Sube una página de historia y la ANTEPONE: el hilo se lee de arriba abajo. */
  const handleLoadOlder = useCallback(() => {
    const oldest = messages[0]?.id;
    if (!selectedId || !oldest || loadingOlder) return;
    setLoadingOlder(true);
    listMessages(selectedId, { before: oldest })
      .then((page) => {
        // Cambiar de hilo mientras cargaba dejaría los mensajes de otra conversación
        // pegados arriba de esta.
        if (selectedIdRef.current !== selectedId) return;
        setMessages((prev) => [...page.items, ...prev]);
        setHasOlder(page.has_more);
      })
      .catch(() => {
        // Va al aviso descartable de la cabecera y NO al `ErrorState` del hilo: ese
        // reemplaza todo el panel, y aquí los mensajes que ya se leen siguen siendo válidos.
        setActionError("No se pudo cargar el historial anterior.");
      })
      .finally(() => setLoadingOlder(false));
  }, [selectedId, messages, loadingOlder]);

  const handleRetry = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

  const handleRetryMessages = useCallback(() => {
    // Forces the skeleton back on (loadedId !== selectedId) while re-fetching.
    setLoadedId(null);
    setMessagesRetryKey((k) => k + 1);
  }, []);

  const handleStatusFilterChange = useCallback(
    (status: ConversationStatus | "all") => setFilters({ status }),
    [setFilters],
  );

  const handleViewChange = useCallback(
    (next: InboxView) => setFilters({ view: next }),
    [setFilters],
  );

  const handleClearFilters = useCallback(() => {
    setSearch("");
    setCustomer(null);
    setFilters({ status: "all" });
  }, [setFilters]);

  const handleSelect = useCallback((id: string) => {
    // Re-clicking the already-open conversation is a no-op: its messages are
    // already loaded (and kept live by SSE), so re-selecting would only risk
    // wiping them and getting stuck on the skeleton.
    if (id === selectedIdRef.current) return;
    setSelectedId(id);
    // Mirror the selection into the URL (deep-linkable, survives F5) without a
    // navigation/refetch — replaceState keeps the list and thread state intact.
    // Se PARCHEA la query vigente en vez de reescribirla: ahora los filtros también viven
    // ahí, y un `?id=…` a secas los borraba al abrir un hilo.
    setSearchParam("id", id);
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
    pendingRowsRef.current.add(conversationId);
    clearTimeout(rowsTimerRef.current);
    rowsTimerRef.current = setTimeout(() => {
      const ids = [...pendingRowsRef.current];
      pendingRowsRef.current.clear();
      for (const id of ids) {
        getConversation(id)
          .then((fresh) =>
            setConversations((prev) =>
              prev
                .map((c) => (c.id === id ? { ...fresh, unread: c.unread } : c))
                .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
            ),
          )
          .catch(() => {});
      }
    }, SSE_COALESCE_MS);
  }, []);

  /**
   * Re-baja la página más nueva del hilo abierto. Solo el abierto: estando en otra
   * conversación (o en el dashboard) no hay nada en pantalla que mostrar y la request es puro
   * gasto. El evento no puede traer el mensaje: viaja sin texto (política de PII, solo ids).
   *
   * Lo que llega se MERGEA por la cola (ver `mergeNewMessages`), así que la historia que el
   * operador subió a leer no se descarta.
   */
  const reloadOpenThread = useCallback((conversationId: string) => {
    if (selectedIdRef.current !== conversationId) return;
    clearTimeout(threadTimerRef.current);
    threadTimerRef.current = setTimeout(() => {
      if (selectedIdRef.current !== conversationId) return;
      listMessages(conversationId)
        .then((page) => {
          if (selectedIdRef.current !== conversationId) return;
          const { messages: merged, replaced } = mergeNewMessages(
            messagesRef.current,
            page,
          );
          setMessages(merged);
          // Solo al reemplazar: el `has_more` de la página más nueva habla de lo que hay
          // arriba de ESA página, no de lo que ya se cargó por encima.
          if (replaced) setHasOlder(page.has_more);
        })
        .catch(() => {});
    }, SSE_COALESCE_MS);
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
                // Con el filtro de cliente puesto, la bandeja es el historial de UNA
                // persona: insertar aquí la conversación de otra convierte el filtro en
                // mentira. El evento no trae `customer_id`, pero la conversación sí.
                if (customerIdRef.current && conv.customer_id !== customerIdRef.current)
                  return;
                // Se deduplica por el id de lo que VOLVIÓ, no por el del evento: si el
                // servidor devuelve otra fila (una redirección de hilo, un id reciclado en
                // un test), comparar contra el evento la inserta duplicada y React se queda
                // con dos hijos con la misma key.
                setConversations((prev) =>
                  prev.some((c) => c.id === conv.id)
                    ? prev
                    : [...prev, conv].sort((a, b) =>
                        b.last_message_at.localeCompare(a.last_message_at),
                      ),
                );
              })
              .catch(() => {});
          }
          reloadOpenThread(conversation_id);
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
          reloadOpenThread(conversation_id);
          break;
        }
      }
    });
    return () => {
      unsub();
      // Un refetch coalescido en vuelo al desmontar escribiría estado sobre un componente
      // que ya no está.
      clearTimeout(rowsTimerRef.current);
      clearTimeout(threadTimerRef.current);
    };
    // `refreshRow` y `reloadOpenThread` son estables (useCallback sin deps): no re-suscriben
    // el stream.
  }, [refreshRow, reloadOpenThread]);

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
          onStatusFilterChange={handleStatusFilterChange}
          view={view}
          onViewChange={handleViewChange}
          search={search}
          onSearchChange={setSearch}
          customer={customer}
          onCustomerChange={setCustomer}
          onClearFilters={handleClearFilters}
          loading={loading}
          error={error}
          onRetry={handleRetry}
          agentNames={agentNames}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
          moreError={moreError}
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
              // Solo se cierra el hilo: los filtros de la bandeja siguen puestos, así que su
              // parte de la query se queda.
              setSearchParam("id", null);
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
            hasOlder={hasOlder}
            loadingOlder={loadingOlder}
            onLoadOlder={handleLoadOlder}
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
