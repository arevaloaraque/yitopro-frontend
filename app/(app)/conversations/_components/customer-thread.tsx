"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ChevronLeft,
  MessageSquare,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerRating } from "@/components/customers/rating";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Loading } from "@/components/states/loading";
import type { useCustomerThread } from "@/lib/conversations/use-customer-thread";
import { formatDateTime } from "@/lib/format/date";

import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { statusLabel, statusVariant } from "./conversation-list";
import { ThreadDay } from "./thread-day";
import { ThreadDivider, ThreadGap } from "./thread-divider";
import { ThreadFinder } from "./thread-finder";

type Thread = ReturnType<typeof useCustomerThread>;

interface CustomerThreadProps {
  thread: Thread;
  /** Nombre ya resuelto (o el teléfono formateado si no tiene nombre). */
  customerName: string;
  customerPhone: string;
  /** Agregado histórico del CLIENTE, que viene en cada fila: cero requests. */
  ratingAvg: number | null;
  ratingCount: number;
  currentUserId: string | null;
  agentNames: Map<string, string>;
  onSendMessage: (text: string) => Promise<void>;
  onTake: () => Promise<void>;
  onClose: () => Promise<void>;
  onReactivate: () => Promise<void>;
  sendingMessage: boolean;
  actionError: string | null;
  onDismissError: () => void;
  onBack: () => void;
}

/** Cuánto margen sobre el fondo cuenta como «está mirando el final». */
const NEAR_BOTTOM_PX = 120;

/** Tope de pasos al llenar la primera pantalla. Evita un bucle si algo miente. */
const MAX_FILL_STEPS = 8;

/**
 * El hilo continuo de un número.
 *
 * Reemplaza al panel por conversación: acá la unidad es el CLIENTE y las N
 * conversaciones se leen seguidas, con un delimitador donde termina cada una.
 */
export function CustomerThread({
  thread,
  customerName,
  customerPhone,
  ratingAvg,
  ratingCount,
  currentUserId,
  agentNames,
  onSendMessage,
  onTake,
  onClose,
  onReactivate,
  sendingMessage,
  actionError,
  onDismissError,
  onBack,
}: CustomerThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  /** Alto del scroll antes de anteponer, para corregir la posición. */
  const prevHeight = useRef(0);
  const prevCount = useRef(0);
  // Los pasos de relleno se cuentan ENTRE renders: el efecto se vuelve a ejecutar con
  // cada página, así que un contador local reiniciaba el tope en cada vuelta.
  const fillSteps = useRef(0);

  const {
    timeline,
    live,
    state,
    search,
    loadOlder,
    fillDown,
    canLoadOlder,
    canFillDown,
  } = thread;
  const live_ = live;
  const isClosedAll = live_ === null;
  const isMine =
    live_?.conv.assignee_id !== null && live_?.conv.assignee_id === currentUserId;
  const isHandoff = live_?.conv.status === "human_handoff";

  // ── Llenar la primera pantalla ──────────────────────────────────────────────
  // Se pagina hacia atrás hasta que el contenido desborda el viewport con margen.
  // Normalmente 1-2 requests: una conversación reciente ya trae ~50 mensajes.
  useEffect(() => {
    if (thread.loading || state.segments.length === 0) return;
    let cancelado = false;
    (async () => {
      while (fillSteps.current < MAX_FILL_STEPS) {
        fillSteps.current += 1;
        const el = scrollRef.current;
        if (cancelado || !el) return;
        // Sin alto no hay pantalla que llenar. Cubre el contenedor todavía sin
        // medir y jsdom, donde todo mide 0 y esto sería un bucle de 8 páginas.
        if (el.clientHeight === 0) return;
        if (el.scrollHeight > el.clientHeight + NEAR_BOTTOM_PX) return;
        if (!canLoadOlder) return;
        const hubo = await loadOlder();
        if (!hubo) return;
      }
    })();
    return () => {
      cancelado = true;
    };
    // `loadedCount` es la señal de que llegó una página: reevaluar el desborde.
  }, [
    thread.loading,
    state.segments.length,
    thread.loadedCount,
    canLoadOlder,
    loadOlder,
  ]);

  // ── Scroll infinito hacia arriba y hacia abajo ──────────────────────────────
  // Es el único `IntersectionObserver` del panel: el resto pagina con botón. Va
  // porque un hilo estilo WhatsApp carga al llegar al borde, no al pulsar.
  //
  // `hayContenido` está en las dependencias porque los centinelas viven DENTRO del
  // bloque que solo se dibuja con la timeline no vacía: al montar son `null`, y sin
  // esta dependencia el efecto no volvía a correr cuando aparecían —`canLoadOlder`
  // ya valía true—, así que el observador no observaba nada y el scroll infinito no
  // cargaba jamás. Lo encontró la verificación en vivo, no la lectura del código.
  const hayContenido = timeline.length > 0;
  useEffect(() => {
    const arriba = topSentinel.current;
    const abajo = bottomSentinel.current;
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          if (e.target === arriba && canLoadOlder) void loadOlder();
          if (e.target === abajo && canFillDown) void fillDown();
        }
      },
      { root, rootMargin: "200px 0px" },
    );
    if (arriba) io.observe(arriba);
    if (abajo) io.observe(abajo);
    return () => io.disconnect();
  }, [hayContenido, canLoadOlder, canFillDown, loadOlder, fillDown]);

  // ── Conservar la posición al anteponer historia ─────────────────────────────
  // Sin esto, cada página antepuesta empuja lo que se está leyendo fuera de la
  // pantalla. Tres líneas y ninguna librería.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const creció = thread.loadedCount > prevCount.current;
    if (creció && !atBottom && prevHeight.current > 0) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    }
    prevHeight.current = el.scrollHeight;
    prevCount.current = thread.loadedCount;
  }, [thread.loadedCount, atBottom]);

  // ── Bajar al final solo si ya se estaba mirando el final ────────────────────
  // El hilo fusiona N conversaciones: sin esta guarda, un mensaje entrante en
  // CUALQUIERA de ellas arrancaría al operador de la historia que está leyendo.
  const ultimoId = timeline.filter((i) => i.kind === "message").at(-1)?.key;
  useEffect(() => {
    if (!atBottom) return;
    endRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [ultimoId, atBottom]);

  // ── Llevar la vista a un ancla (salto por fecha / coincidencia) ─────────────
  const { anchor, clearAnchor } = thread;
  useEffect(() => {
    if (!anchor) return;
    const el = scrollRef.current?.querySelector(`[data-msg="${anchor}"]`);
    // Todavía no está en pantalla: se espera a la próxima página sin consumir el
    // ancla. `loadedCount` en las dependencias es lo que da ese reintento.
    if (!el) return;
    el.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
    // Se CONSUME: si no, cada página que llega devuelve la vista al mensaje anclado
    // y el operador no puede seguir leyendo desde ahí.
    clearAnchor();
  }, [anchor, thread.loadedCount, clearAnchor]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX);
  }, []);

  const bajarAlFinal = useCallback(() => {
    thread.clearAnchor();
    setAtBottom(true);
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  const activeHit = search.active >= 0 ? search.hits[search.active] : null;
  const agentName = live_?.conv.active_agent
    ? (agentNames.get(live_.conv.active_agent) ?? live_.conv.active_agent)
    : null;
  /** `min` del selector de fecha: solo se puede afirmar con el índice completo. */
  const minDay =
    !state.indexHasMore && state.segments.length
      ? state.segments[state.segments.length - 1].conv.created_at.slice(0, 10)
      : null;

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Cabecera: el NÚMERO, no una conversación ── */}
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
                  <span className="text-[0.7rem] text-muted-foreground">
                    {customerPhone}
                  </span>
                  <CustomerRating avg={ratingAvg} count={ratingCount} compact />
                </div>
                {/* El objetivo de las acciones se NOMBRA, para que la cabecera y el
                    cuerpo no puedan discrepar. */}
                {live_ ? (
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                    <Badge
                      variant={statusVariant(live_.conv.status)}
                      className="h-5 text-[11px]"
                    >
                      {statusLabel(live_.conv.status)}
                    </Badge>
                    <span>
                      Actúa sobre la conversación abierta ·{" "}
                      {formatDateTime(live_.conv.last_message_at)}
                    </span>
                    {agentName ? <span>· {agentName}</span> : null}
                  </p>
                ) : (
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">
                    Sin conversación abierta
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setFinderOpen((v) => !v)}
                aria-label="Buscar en la conversación"
                aria-pressed={finderOpen}
              >
                <Search className="size-4" />
              </Button>
              {/* Sin conversación abierta NO hay botones: tomar o cerrar una
                  cerrada devuelve 409, y un botón que solo puede fallar no es un
                  botón. Tampoco se ofrece «reabrir»: no existe endpoint. */}
              {live_ && !isMine ? (
                <Button variant="secondary" size="xs" onClick={onTake}>
                  Tomar conversación
                </Button>
              ) : null}
              {isHandoff ? (
                <Button variant="outline" size="xs" onClick={onReactivate}>
                  Reactivar IA
                </Button>
              ) : null}
              {live_ ? (
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

        {/* ── El hilo ── */}
        <div className="relative flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="h-full overflow-y-auto py-3"
          >
            {thread.loading ? (
              <Loading rows={5} className="px-4" />
            ) : thread.error && timeline.length === 0 ? (
              <ErrorState
                title="No se pudo cargar el historial"
                description={thread.error}
                onRetry={thread.retry}
                className="m-4 border-none bg-transparent"
              />
            ) : timeline.length === 0 && state.segments.length > 0 ? (
              // El índice ya trajo conversaciones y falta su primera página: es
              // latencia, no vacío. Decir «sin conversaciones» acá sería falso.
              <Loading rows={5} className="px-4" />
            ) : timeline.length === 0 ? (
              <EmptyState
                title="Sin conversaciones con este número"
                description="Cuando el cliente escriba, el hilo aparecerá acá."
                icon={MessageSquare}
                className="m-4 border-none bg-transparent"
              />
            ) : (
              <>
                <div ref={topSentinel} />
                {thread.loadingOlder ? (
                  <p
                    className="py-2 text-center text-[0.7rem] text-muted-foreground"
                    role="status"
                  >
                    Cargando historial…
                  </p>
                ) : null}
                {timeline.map((item) => {
                  if (item.kind === "day") {
                    return (
                      <ThreadDay
                        key={item.key}
                        iso={item.iso}
                        onPick={thread.jumpToDate}
                      />
                    );
                  }
                  if (item.kind === "boundary") {
                    return (
                      <ThreadDivider
                        key={item.key}
                        seg={item.seg}
                        current={item.seg.conv.id === live_?.conv.id}
                      />
                    );
                  }
                  if (item.kind === "gap") {
                    return (
                      <ThreadGap
                        key={item.key}
                        seg={item.seg}
                        loading={thread.fillingDown}
                        onLoad={() => void thread.fillDown()}
                      />
                    );
                  }
                  return (
                    <div key={item.key} data-msg={item.message.id}>
                      <MessageBubble
                        message={item.message}
                        highlight={search.query || undefined}
                        active={activeHit?.messageId === item.message.id}
                      />
                    </div>
                  );
                })}
                {thread.fillingDown ? (
                  <p
                    className="py-2 text-center text-[0.7rem] text-muted-foreground"
                    role="status"
                  >
                    Cargando lo que sigue…
                  </p>
                ) : null}
                <div ref={bottomSentinel} />
                <div ref={endRef} />
              </>
            )}
          </div>

          {/* Volver al presente: sin esto, un hilo largo no tiene vuelta desde la
              historia. Cuenta los no leídos, que son locales (el backend manda 0). */}
          {!atBottom ? (
            <Button
              size="icon"
              variant="secondary"
              className="absolute right-4 bottom-4 rounded-full shadow-md"
              onClick={bajarAlFinal}
              aria-label="Bajar al final"
            >
              <ArrowDown className="size-4" />
            </Button>
          ) : null}
        </div>

        <MessageInput
          disabled={!isMine}
          disabledMessage={
            isClosedAll
              ? "El último contacto está cerrado. Si el cliente vuelve a escribir se abre una conversación nueva y podrás responder."
              : "Toma la conversación para responder."
          }
          sending={sendingMessage}
          onSubmit={onSendMessage}
        />
      </div>

      {finderOpen ? (
        <ThreadFinder
          search={search}
          onSearch={(q) => void thread.runSearch(q)}
          onCancel={thread.cancelSearch}
          onClear={thread.clearSearch}
          onContinue={() => void thread.runSearch(search.query, true)}
          onGoto={thread.gotoHit}
          onJumpToDate={(d) => void thread.jumpToDate(d)}
          dateNotice={thread.dateNotice}
          onDismissNotice={thread.dismissDateNotice}
          minDay={minDay}
          jumping={thread.loadingOlder}
          onClose={() => setFinderOpen(false)}
        />
      ) : null}
    </div>
  );
}
