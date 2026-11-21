"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare } from "lucide-react";

import {
  closeConversation,
  getConversation,
  listConversations,
  reactivateAI,
  sendMessage,
  takeConversation,
} from "@/lib/api/conversations";
import { useCustomerThread } from "@/lib/conversations/use-customer-thread";
import { useRequireAssistant } from "@/lib/business";
import { subscribeToEvents } from "@/lib/sse";
import { useAgents } from "@/lib/agents";
import { useAuth } from "@/lib/auth";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { dayISO } from "@/lib/format/date";
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
} from "@/lib/types";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { cn } from "@/lib/utils";

import { ConversationList } from "./_components/conversation-list";
import { CustomerThread } from "./_components/customer-thread";

/** Lo que viaja en la URL como FILTRO. La selección va aparte (ver `setSearchParam`). */
const FILTER_DEFAULTS = { status: "all", q: "" };

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
 * volvía a bajar el hilo más la fila. Lo que hace falta es que una ráfaga cueste una request y
 * no N. Pedir SOLO los mensajes nuevos necesitaría un `after=` que el backend no expone:
 * `before=` sirve para subir a la historia, no para completar la cola.
 */
const SSE_COALESCE_MS = 250;

/** El orden de la bandeja. Estaba escrito cinco veces en este archivo. */
const byRecentActivity = (a: Conversation, b: Conversation) =>
  b.last_message_at.localeCompare(a.last_message_at);

function ConversationsInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  /**
   * Lo que está abierto es un NÚMERO (id de cliente), no una conversación.
   *
   * `?chat=` es la clave canónica y la única que esta pantalla lee. `?id=` se
   * acepta como entrada —lo escribe la campana, cuyo payload SSE no trae el
   * cliente— y se resuelve a `chat=` una sola vez: no hay ramas que lean `id`.
   */
  const [openChat, setOpenChat] = useState<string | null>(() =>
    searchParams.get("chat"),
  );
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Estado y término viven en la URL: una bandeja filtrada se comparte y sobrevive un F5. El
  // hook preserva las claves que no gestiona, así que el `?chat=` abierto no se pierde al
  // filtrar.
  const [filters, setFilters] = useUrlFilters(FILTER_DEFAULTS);
  const statusFilter = asStatusFilter(filters.status);

  const [search, setSearch] = useState(() => filters.q);
  const debouncedSearch = useDebounced(search);
  useEffect(() => {
    setFilters({ q: debouncedSearch.trim() });
  }, [debouncedSearch, setFilters]);
  const searchTerm = filters.q;

  // Filtro de SERVIDOR (`?customer_id=`). No va a la URL porque el combobox necesita el
  // nombre para dibujarse y el id solo no lo trae.
  const [customer, setCustomer] = useState<CustomerSelection>(null);
  const customerId = customer?.id ?? null;

  // Paginación por cursor. El cursor es OPACO: se guarda y se devuelve tal cual.
  const [cursor, setCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [lastPageAddedNothing, setLastPageAddedNothing] = useState(false);

  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { agents } = useAgents();
  const agentNames = useMemo(
    () => new Map(agents.map((a) => [a.id, a.name])),
    [agents],
  );

  const thread = useCustomerThread(openChat);

  const conversationsRef = useRef(conversations);
  const customerIdRef = useRef(customerId);
  const openChatRef = useRef(openChat);
  const pendingRowsRef = useRef<Set<string>>(new Set());
  const rowsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingThreadRef = useRef<Map<string, Conversation>>(new Map());
  const threadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    conversationsRef.current = conversations;
  });
  useEffect(() => {
    customerIdRef.current = customerId;
  });
  useEffect(() => {
    openChatRef.current = openChat;
  });

  /**
   * Los tres filtros van al SERVIDOR. El buscador incluido: recortar en el navegador sobre
   * una lista paginada mostraría «lo que coincide de las 25 filas que bajé».
   */
  const listParams = useMemo(
    () => ({
      ...(statusFilter === "all" ? {} : { status: statusFilter }),
      ...(customerId ? { customerId } : {}),
      ...(searchTerm ? { search: searchTerm } : {}),
    }),
    [statusFilter, customerId, searchTerm],
  );

  const loadInbox = useCallback(() => {
    setLoading(true);
    setError(null);
    setLastPageAddedNothing(false);
    let vigente = true;
    listConversations(listParams)
      .then((page) => {
        if (!vigente) return;
        setConversations(page.items);
        setCursor(page.next_cursor);
        setHasMore(page.has_more);
      })
      .catch((e) => {
        if (!vigente) return;
        setError(e instanceof Error ? e : new Error("Error al cargar conversaciones"));
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [listParams]);

  // Diferido: poner el estado de forma sincrónica dentro del efecto encadena
  // renders, y es el patrón que ya usan los contextos del panel.
  useEffect(() => {
    let cancelar: (() => void) | undefined;
    const t = setTimeout(() => {
      cancelar = loadInbox();
    }, 0);
    return () => {
      clearTimeout(t);
      cancelar?.();
    };
  }, [loadInbox, retryKey]);

  /**
   * Página siguiente de CONVERSACIONES, que puede no agregar ningún NÚMERO nuevo.
   * Eso hay que anunciarlo: un botón que no cambia nada se lee como roto.
   */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await listConversations(listParams, { cursor });
      const antes = new Set(conversationsRef.current.map((c) => c.customer_id));
      const nuevos = page.items.filter((c) => !antes.has(c.customer_id)).length;
      setConversations((prev) => [...prev, ...page.items].sort(byRecentActivity));
      setCursor(page.next_cursor);
      setHasMore(page.has_more);
      setLastPageAddedNothing(page.items.length > 0 && nuevos === 0);
    } catch (e) {
      // Al pie, no al `ErrorState`: derribar la pantalla por la página 2 tira el
      // trabajo de leer las primeras filas.
      setMoreError(e instanceof Error ? e.message : "No se pudo cargar más");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, listParams, loadingMore]);

  /** Abre un número y deja la URL en su forma canónica. */
  const openNumber = useCallback((cid: string) => {
    setResolveError(null);
    setOpenChat(cid);
    openChatRef.current = cid;
    setSearchParam("chat", cid);
    setSearchParam("id", null);
  }, []);

  const closeNumber = useCallback(() => {
    setOpenChat(null);
    openChatRef.current = null;
    setSearchParam("chat", null);
  }, []);

  /**
   * Resolución del `?id=` entrante.
   *
   * Repara un defecto que existía: la conversación abierta se derivaba de
   * `conversations.find(...)`, así que un `?id=` de una conversación fuera de la
   * primera página dejaba la pantalla en «Selecciona una conversación» **con los
   * mensajes ya bajados y descartados**. Lo sufren la campana y el drawer de
   * cliente, que enlazan cualquier id.
   *
   * El ancla se resuelve reusando el salto por fecha: llevar la vista al día del
   * último mensaje de esa conversación es exactamente lo que se quiere, y es código
   * ya probado.
   */
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || openChatRef.current) return;
    const local = conversationsRef.current.find((c) => c.id === id);
    if (local) {
      openNumber(local.customer_id);
      return;
    }
    let cancelled = false;
    setResolving(true);
    getConversation(id)
      .then((conv) => {
        if (cancelled) return;
        openNumber(conv.customer_id);
        // El ancla, si no es la conversación más reciente del número.
        void Promise.resolve().then(() => {
          if (!cancelled)
            void thread.jumpToDate(dayISO(new Date(conv.last_message_at)));
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setResolveError(
          e instanceof Error ? e.message : "No se pudo abrir esa conversación",
        );
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
    // `thread` cambia en cada render; la resolución depende del `?id=` y de si ya
    // hay algo abierto, que se leen por ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, openNumber]);

  /**
   * Refresca UNA fila de la bandeja desde el servidor, con coalescing.
   *
   * El preview no se puede parchear desde el payload (viaja sin texto), y `unread` se preserva
   * del estado local porque el backend lo devuelve en 0: un refetch a secas borraría el
   * contador que este mismo handler acaba de subir.
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
                .sort(byRecentActivity),
            ),
          )
          .catch(() => {});
      }
    }, SSE_COALESCE_MS);
  }, []);

  /**
   * Recarga del HILO con coalescing, hermana de `refreshRow`.
   *
   * Un cliente que escribe cinco líneas emite cinco `mensaje_recibido`; sin agrupar,
   * cada uno vuelve a bajar la página más nueva del hilo. Recibe la fila ya resuelta
   * para no repetir el `getConversation` que esta misma pantalla acaba de hacer.
   */
  const reloadThread = useCallback(
    (conv: Conversation) => {
      pendingThreadRef.current.set(conv.id, conv);
      clearTimeout(threadTimerRef.current);
      threadTimerRef.current = setTimeout(() => {
        const filas = [...pendingThreadRef.current.values()];
        pendingThreadRef.current.clear();
        for (const fila of filas) void thread.applyIncoming(fila);
      }, SSE_COALESCE_MS);
    },
    [thread],
  );
  const reloadThreadRef = useRef(reloadThread);
  useEffect(() => {
    reloadThreadRef.current = reloadThread;
  });

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
                        // El hilo abierto es de un NÚMERO: leído significa que ese
                        // número está en pantalla, no esa conversación.
                        unread:
                          c.customer_id === openChatRef.current ? 0 : c.unread + 1,
                      }
                    : c,
                )
                .sort(byRecentActivity),
            );
            refreshRow(conversation_id);
            const fila = conversationsRef.current.find((c) => c.id === conversation_id);
            if (fila) reloadThreadRef.current(fila);
          } else {
            // Conversación nueva: se pide y se inserta en vez de perder el evento.
            getConversation(conversation_id)
              .then((conv) => {
                if (customerIdRef.current && conv.customer_id !== customerIdRef.current)
                  return;
                // Dedupe por el id que VOLVIÓ, no por el del evento.
                setConversations((prev) =>
                  prev.some((c) => c.id === conv.id)
                    ? prev
                    : [...prev, conv].sort(byRecentActivity),
                );
                // La misma fila que se acaba de resolver: el hilo decide si es de
                // su número, sin pedirla otra vez.
                reloadThreadRef.current(conv);
              })
              .catch(() => {});
          }
          break;
        }
        case "conversacion_asignada": {
          const { conversation_id, assignee_id } = (event as ConversacionAsignadaEvent)
            .data;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation_id
                ? { ...c, status: "human_handoff" as const, assignee_id }
                : c,
            ),
          );
          void thread.refreshConversation(conversation_id);
          break;
        }
        case "conversacion_cerrada": {
          const { conversation_id } = (event as ConversacionCerradaEvent).data;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation_id ? { ...c, status: "closed" as const } : c,
            ),
          );
          // Sin esto la cabecera del hilo se queda mostrando «IA activa» sobre una
          // conversación ya cerrada — y con el hilo abierto por deep link, su
          // conversación puede no estar en la página cargada de la bandeja.
          void thread.refreshConversation(conversation_id);
          break;
        }
        case "conversacion_escalada": {
          const { conversation_id } = (event as ConversacionEscaladaEvent).data;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation_id
                ? { ...c, status: "human_handoff" as const, active_agent: null }
                : c,
            ),
          );
          void thread.refreshConversation(conversation_id);
          break;
        }
        case "conversacion_reactivada": {
          const { conversation_id } = (event as ConversacionReactivadaEvent).data;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation_id
                ? { ...c, status: "ai_active" as const, assignee_id: null }
                : c,
            ),
          );
          void thread.refreshConversation(conversation_id);
          break;
        }
        case "mensaje_automatico_enviado": {
          const { conversation_id } = (event as MensajeAutomaticoEnviadoEvent).data;
          setConversations((prev) =>
            prev
              .map((c) =>
                c.id === conversation_id
                  ? { ...c, last_message_at: event.emitted_at }
                  : c,
              )
              .sort(byRecentActivity),
          );
          refreshRow(conversation_id);
          const auto = conversationsRef.current.find((c) => c.id === conversation_id);
          if (auto) reloadThreadRef.current(auto);
          break;
        }
      }
    });
    return () => {
      unsub();
      clearTimeout(rowsTimerRef.current);
      clearTimeout(threadTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshRow]);

  // ── Acciones: siempre sobre la conversación abierta del número ───────────────

  const live = thread.live;

  const applyResult = useCallback(
    (updated: Conversation) => {
      thread.applyAction(updated);
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...updated, unread: c.unread } : c)),
      );
    },
    [thread],
  );

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!live) return;
      setSendingMessage(true);
      setActionError(null);
      try {
        // La respuesta del POST es la ÚNICA vía por la que aparece: no existe evento
        // SSE de mensaje saliente.
        const msg = await sendMessage(live.conv.id, text);
        thread.appendOwnMessage(live.conv.id, msg);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Error al enviar el mensaje",
        );
      } finally {
        setSendingMessage(false);
      }
    },
    [live, thread],
  );

  const handleTake = useCallback(async () => {
    if (!live) return;
    setActionError(null);
    try {
      applyResult(await takeConversation(live.conv.id));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al tomar la conversación",
      );
    }
  }, [live, applyResult]);

  const handleClose = useCallback(async () => {
    if (!live) return;
    setActionError(null);
    try {
      applyResult(await closeConversation(live.conv.id));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al cerrar la conversación",
      );
    }
  }, [live, applyResult]);

  const handleReactivate = useCallback(async () => {
    if (!live) return;
    setActionError(null);
    try {
      applyResult(await reactivateAI(live.conv.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al reactivar IA");
    }
  }, [live, applyResult]);

  // Identidad del número abierto: de la bandeja si está, y si no del propio hilo
  // (un deep link puede abrir un número que no está en la página cargada).
  const identity = useMemo(() => {
    const fromInbox = conversations.find((c) => c.customer_id === openChat);
    const fromThread = thread.state.segments[0]?.conv;
    return fromInbox ?? fromThread ?? null;
  }, [conversations, openChat, thread.state.segments]);

  return (
    <div className="-mx-6 -my-8 flex h-[calc(100vh-var(--spacing)*20)] md:-mx-12 md:-my-12">
      <div
        className={cn(
          "w-full shrink-0 border-r border-border/60 bg-card lg:w-96",
          openChat && "hidden lg:block",
        )}
      >
        <ConversationList
          conversations={conversations}
          selectedCustomerId={openChat}
          onSelect={openNumber}
          statusFilter={statusFilter}
          onStatusFilterChange={(status) =>
            setFilters({ status: status === "all" ? "all" : status })
          }
          search={search}
          onSearchChange={setSearch}
          customer={customer}
          onCustomerChange={setCustomer}
          onClearFilters={() => {
            setSearch("");
            setCustomer(null);
            setFilters({ status: "all", q: "" });
          }}
          loading={loading}
          error={error}
          onRetry={() => setRetryKey((k) => k + 1)}
          agentNames={agentNames}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
          moreError={moreError}
          lastPageAddedNothing={lastPageAddedNothing}
        />
      </div>

      <div
        className={cn(
          "min-w-0 flex-1 flex-col bg-background",
          openChat || resolving || resolveError ? "flex" : "hidden lg:flex",
        )}
      >
        {resolveError ? (
          // NO el vacío silencioso de antes: la bandeja está bien, lo que falló es
          // abrir ese enlace.
          <ErrorState
            title="No se pudo abrir esa conversación"
            description={resolveError}
            onRetry={() => setResolveError(null)}
            className="m-auto border-none bg-transparent"
          />
        ) : openChat ? (
          // Se monta con `openChat` y NO con `identity`: la identidad puede tardar
          // (un deep link a un número que no está en la página cargada de la bandeja
          // la trae recién con el índice), y gatear con ella dejaba al hilo pidiendo
          // datos detrás de un «Selecciona un número».
          <CustomerThread
            thread={thread}
            customerName={
              identity
                ? identity.customer_name.trim() || formatNumber(identity.customer_phone)
                : "Cargando…"
            }
            customerPhone={identity ? formatNumber(identity.customer_phone) : ""}
            ratingAvg={identity?.customer_rating_avg ?? null}
            ratingCount={identity?.customer_rating_count ?? 0}
            currentUserId={user?.id ?? null}
            agentNames={agentNames}
            onSendMessage={handleSendMessage}
            onTake={handleTake}
            onClose={handleClose}
            onReactivate={handleReactivate}
            sendingMessage={sendingMessage}
            actionError={actionError}
            onDismissError={() => setActionError(null)}
            onBack={closeNumber}
          />
        ) : (
          <EmptyState
            title="Selecciona un número"
            description="Elige un número de la bandeja para ver todo su historial."
            icon={MessageSquare}
            className="m-auto border-none bg-transparent"
          />
        )}
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  const denied = useRequireAssistant();
  if (denied) return null;
  return (
    // `useUrlFilters` usa `useSearchParams`, que en el App Router exige Suspense.
    <Suspense fallback={null}>
      <ConversationsInner />
    </Suspense>
  );
}
