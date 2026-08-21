"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getConversation,
  listConversations,
  listMessages,
} from "@/lib/api/conversations";
import {
  appendIndexPage,
  appendMessage,
  applyPage,
  buildTimeline,
  initState,
  liveSegment,
  nextToFillDown,
  nextToLoad,
  patchConversation,
  pendingToScan,
  prependSegment,
  searchLoaded,
  searchScope,
  segmentLoad,
  targetForDate,
  type DateTarget,
  type SearchHit,
  type ThreadState,
} from "@/lib/conversations/thread";
import { dayISO } from "@/lib/format/date";
import type { Conversation, Message } from "@/lib/types";

/**
 * El índice se pide de 100, no de 25.
 *
 * Es el cambio más rentable del rediseño: por UN request queda el esqueleto
 * completo del historial del número —fecha, estado y calificación de cada
 * conversación— sin bajar un solo mensaje. Es lo que hace que localizar una fecha
 * cueste cero requests.
 */
const INDEX_PAGE = 100;

/** Página de lectura. El default del backend; cada paso suma ≤50 burbujas. */
const MSG_PAGE = 50;

/**
 * Página del barrido de búsqueda: el máximo. Buscar es una acción explícita del
 * operador y lo que importa ahí es el número de rondas, no el tamaño del DOM —
 * los resultados se muestran en un panel, no como burbujas.
 */
const SEARCH_PAGE = 100;

/** Peticiones en paralelo del barrido. Las cadenas de segmentos son independientes. */
const SEARCH_CONCURRENCY = 4;

/** Tope antes de preguntar si seguir. Evita un barrido eterno sin decirlo. */
const SEARCH_PAGES_BEFORE_ASKING = 20;

export interface SearchState {
  query: string;
  hits: SearchHit[];
  /** Índice de la coincidencia activa, para anterior/siguiente. */
  active: number;
  running: boolean;
  /** Mensajes revisados y desde cuándo: el alcance que se muestra, nunca implícito. */
  scanned: number;
  since: string | null;
  /** Conversaciones que todavía no se revisaron enteras. */
  pending: number;
  /** Se paró en el tope y espera confirmación para seguir. */
  paused: boolean;
}

const SEARCH_IDLE: SearchState = {
  query: "",
  hits: [],
  active: -1,
  running: false,
  scanned: 0,
  since: null,
  pending: 0,
  paused: false,
};

/**
 * El hilo de un número: estado, carga y las acciones que lo mueven.
 *
 * Toda la lógica vive en `lib/conversations/thread.ts` (puro y testeado por
 * mutación); acá está solo la orquestación asíncrona y la cancelación.
 *
 * ## Cancelación por generación, no por AbortController
 *
 * `lib/api/client.ts` no expone `signal`, y agregarlo es otra tarea. Cada
 * operación incrementa `genRef` y todo resultado se aplica solo si su generación
 * sigue vigente. El corte no es instantáneo —tarda a lo sumo una latencia— y
 * decirlo así es honesto; prometer un abort inmediato no lo sería. Reemplaza los
 * cuatro chequeos ad-hoc que la pantalla hacía antes y después de cada await, y
 * es lo único que puede cubrir el barrido de búsqueda, que son decenas de awaits
 * en vuelo.
 */
export function useCustomerThread(customerId: string | null) {
  const [state, setState] = useState<ThreadState>(() => initState(customerId ?? ""));
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [fillingDown, setFillingDown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>(SEARCH_IDLE);
  /** Ancla pedida: el mensaje al que hay que llevar la vista. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const [dateNotice, setDateNotice] = useState<DateTarget | null>(null);

  const genRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Guardas de reentrada en refs, no en el estado: si `loadOlder` dependiera de
  // `loadingOlder` sería una función nueva cada vez que el flag cambia, y el
  // `IntersectionObserver` que la observa se destruiría y recrearía dos veces por
  // página. El estado se conserva SOLO para pintar el loader.
  const busyOlder = useRef(false);
  const busyDown = useRef(false);

  const vigente = (gen: number) => gen === genRef.current;

  /** Aplica una actualización solo si su generación sigue viva. */
  const commit = useCallback((gen: number, fn: (st: ThreadState) => ThreadState) => {
    if (!vigente(gen)) return;
    setState((prev) => {
      const next = fn(prev);
      stateRef.current = next;
      return next;
    });
  }, []);

  /** Abre un número: reinicia el estado y pide su índice completo. */
  const openCustomer = useCallback(
    (id: string | null) => {
      genRef.current += 1;
      const gen = genRef.current;
      setSearch(SEARCH_IDLE);
      setAnchor(null);
      setDateNotice(null);
      setError(null);
      const inicial = initState(id ?? "");
      stateRef.current = inicial;
      setState(inicial);
      busyOlder.current = false;
      busyDown.current = false;
      setLoadingOlder(false);
      setFillingDown(false);
      if (!id) return;
      setLoading(true);
      listConversations({ customerId: id }, { limit: INDEX_PAGE })
        .then((page) => {
          commit(gen, (st) => appendIndexPage(st, page));
        })
        .catch((e) => {
          if (!vigente(gen)) return;
          setError(e instanceof Error ? e.message : "No se pudo cargar el historial");
        })
        .finally(() => {
          if (vigente(gen)) setLoading(false);
        });
    },
    [commit],
  );

  // ── Carga del índice al cambiar de número ───────────────────────────────────
  // Diferido a un `setTimeout(…, 0)`, el patrón que ya usan `business-context` y
  // `agents-context`: poner el estado de forma SINCRÓNICA dentro del efecto
  // encadena renders y el lint lo marca.
  useEffect(() => {
    const t = setTimeout(() => openCustomer(customerId), 0);
    return () => clearTimeout(t);
  }, [customerId, openCustomer]);

  /** Un paso de carga. Devuelve `false` cuando ya no hay nada más que pedir. */
  const step = useCallback(
    async (gen: number, dir: "older" | "down"): Promise<boolean> => {
      const st = stateRef.current;
      const trabajo = dir === "older" ? nextToLoad(st) : nextToFillDown(st);
      if (trabajo.kind === "done") return false;

      if (trabajo.kind === "index") {
        const page = await listConversations(
          { customerId: st.customerId },
          { cursor: st.indexCursor, limit: INDEX_PAGE },
        );
        commit(gen, (s) => appendIndexPage(s, page));
        // El índice no produce burbujas: un clic del operador tiene que terminar
        // en mensajes o en un «no hay más» definitivo, así que se encadena.
        return vigente(gen) ? step(gen, dir) : false;
      }

      const page = await listMessages(trabajo.convId, {
        before: trabajo.before,
        limit: MSG_PAGE,
      });
      commit(gen, (s) => applyPage(s, trabajo.convId, trabajo.before, page));
      return true;
    },
    [commit],
  );

  const loadOlder = useCallback(async () => {
    const gen = genRef.current;
    if (busyOlder.current) return false;
    busyOlder.current = true;
    setLoadingOlder(true);
    try {
      return await step(gen, "older");
    } catch (e) {
      if (vigente(gen))
        setError(e instanceof Error ? e.message : "No se pudo cargar más");
      return false;
    } finally {
      busyOlder.current = false;
      // SIN la guarda de generación: el flag es del spinner, no de los datos. Si se
      // apagara solo cuando la generación sigue viva, cambiar de número mientras una
      // página viaja lo dejaba en true para siempre —el hook no se remonta— y el
      // botón del hueco quedaba deshabilitado con «Cargando…» sin salida.
      setLoadingOlder(false);
    }
  }, [step]);

  const fillDown = useCallback(async () => {
    const gen = genRef.current;
    if (busyDown.current) return false;
    busyDown.current = true;
    setFillingDown(true);
    try {
      return await step(gen, "down");
    } catch (e) {
      if (vigente(gen))
        setError(e instanceof Error ? e.message : "No se pudo cargar más");
      return false;
    } finally {
      busyDown.current = false;
      // SIN la guarda de generación: el flag es del spinner, no de los datos. Si se
      // apagara solo cuando la generación sigue viva, cambiar de número mientras una
      // página viaja lo dejaba en true para siempre —el hook no se remonta— y el
      // botón del hueco quedaba deshabilitado con «Cargando…» sin salida.
      setFillingDown(false);
    }
  }, [step]);

  // ── La primera página se pide SIEMPRE ───────────────────────────────────────
  // No depende de medir el viewport: eso decide solo si hace falta RELLENAR más.
  // Atarla a una medición dejaba el hilo vacío en cualquier contenedor todavía sin
  // alto —y en jsdom, donde todo mide 0, vacío siempre.
  useEffect(() => {
    if (loading || state.segments.length === 0) return;
    if (state.segments.some((s) => segmentLoad(s) !== "none")) return;
    const t = setTimeout(() => void loadOlder(), 0);
    return () => clearTimeout(t);
  }, [loading, state.segments, loadOlder]);

  // ── Salto por fecha ─────────────────────────────────────────────────────────

  /**
   * Lleva la vista a un día. Localizar es gratis (índice en memoria); lo que
   * cuesta es traer los mensajes de ESA conversación, no la historia del número.
   */
  const jumpToDate = useCallback(
    async (day: string) => {
      const gen = genRef.current;
      setDateNotice(null);
      let objetivo = targetForDate(stateRef.current, day);

      // Anterior al índice conocido: pedir más y reintentar. Acotado y barato.
      while (objetivo.kind === "need-index" && vigente(gen)) {
        const st = stateRef.current;
        const page = await listConversations(
          { customerId: st.customerId },
          { cursor: st.indexCursor, limit: INDEX_PAGE },
        );
        commit(gen, (s) => appendIndexPage(s, page));
        if (!vigente(gen)) return;
        objetivo = targetForDate(stateRef.current, day);
      }
      if (!vigente(gen)) return;

      if (objetivo.kind !== "hit") {
        setDateNotice(objetivo);
        return;
      }

      // Caminar hacia atrás DENTRO de la conversación objetivo hasta alcanzar el
      // día. La contrapartida del coste: al llegar queda cargado todo lo que va de
      // ahí al final de esa conversación, que es el contexto para leer adelante.
      setLoadingOlder(true);
      try {
        for (let pagina = 0; pagina < SEARCH_PAGES_BEFORE_ASKING; pagina++) {
          const seg = stateRef.current.segments.find(
            (s) => s.conv.id === objetivo.convId,
          );
          if (!seg) return;
          const alcanzado = seg.loaded.find(
            (m) => dayISO(new Date(m.created_at)) >= day,
          );
          if (
            alcanzado &&
            (dayISO(new Date(seg.loaded[0].created_at)) <= day || !seg.hasOlder)
          ) {
            setAnchor(alcanzado.id);
            return;
          }
          const page = await listMessages(seg.conv.id, {
            before: seg.oldest ?? undefined,
            limit: MSG_PAGE,
          });
          commit(gen, (s) => applyPage(s, seg.conv.id, seg.oldest ?? undefined, page));
          if (!vigente(gen)) return;
          if (!page.has_more || page.items.length === 0) {
            // Se llegó al principio: el día cae en un hueco DENTRO del hilo, así
            // que el ancla es el primer mensaje con día ≥ el pedido.
            const s2 = stateRef.current.segments.find(
              (x) => x.conv.id === objetivo.convId,
            );
            const primero = s2?.loaded.find(
              (m) => dayISO(new Date(m.created_at)) >= day,
            );
            setAnchor(primero?.id ?? s2?.loaded[0]?.id ?? null);
            return;
          }
        }
      } catch (e) {
        if (vigente(gen))
          setError(e instanceof Error ? e.message : "No se pudo saltar a esa fecha");
      } finally {
        if (vigente(gen)) setLoadingOlder(false);
      }
    },
    [commit],
  );

  // ── Búsqueda de contenido ───────────────────────────────────────────────────

  /**
   * Barre el historial del número buscando texto.
   *
   * No hay búsqueda de texto en la API, así que lo que se busca se baja primero.
   * Se dispara con Enter o botón, **nunca con debounce**: cada pulsación costaría
   * decenas de requests. Es lo contrario del buscador de la bandeja, y por eso
   * está escrito acá.
   *
   * Lo bajado se mergea en los segmentos: buscar CALIENTA la timeline y ninguna
   * request se tira, así que saltar a un resultado después es gratis.
   */
  const runSearch = useCallback(
    async (query: string, continuar = false) => {
      const q = query.trim();
      genRef.current += 1;
      const gen = genRef.current;
      if (!q) {
        setSearch(SEARCH_IDLE);
        return;
      }
      const inicial = searchLoaded(stateRef.current, q);
      const alcance = searchScope(stateRef.current);
      setSearch({
        query: q,
        hits: inicial,
        active: inicial.length ? 0 : -1,
        running: true,
        scanned: alcance.scanned,
        since: alcance.since,
        pending: pendingToScan(stateRef.current).length,
        paused: false,
      });

      let paginas = continuar ? 0 : 0;
      try {
        for (;;) {
          if (!vigente(gen)) return;
          const st = stateRef.current;
          const objetivos = pendingToScan(st).slice(0, SEARCH_CONCURRENCY);
          if (objetivos.length === 0) {
            if (st.indexHasMore) {
              const page = await listConversations(
                { customerId: st.customerId },
                { cursor: st.indexCursor, limit: INDEX_PAGE },
              );
              commit(gen, (s) => appendIndexPage(s, page));
              continue;
            }
            break;
          }
          if (paginas >= SEARCH_PAGES_BEFORE_ASKING) {
            if (vigente(gen))
              setSearch((s) => ({ ...s, running: false, paused: true }));
            return;
          }

          const páginas = await Promise.all(
            objetivos.map((seg) =>
              listMessages(seg.conv.id, {
                before: seg.oldest ?? undefined,
                limit: SEARCH_PAGE,
              }).then((page) => ({ seg, page })),
            ),
          );
          paginas += páginas.length;
          if (!vigente(gen)) return;
          commit(gen, (s) =>
            páginas.reduce(
              (acc, { seg, page }) =>
                applyPage(acc, seg.conv.id, seg.oldest ?? undefined, page),
              s,
            ),
          );
          if (!vigente(gen)) return;
          const hits = searchLoaded(stateRef.current, q);
          const sc = searchScope(stateRef.current);
          setSearch((s) => ({
            ...s,
            hits,
            active: s.active === -1 && hits.length ? 0 : s.active,
            scanned: sc.scanned,
            since: sc.since,
            pending: pendingToScan(stateRef.current).length,
          }));
        }
        if (vigente(gen)) {
          const hits = searchLoaded(stateRef.current, q);
          const sc = searchScope(stateRef.current);
          setSearch({
            query: q,
            hits,
            active: hits.length ? 0 : -1,
            running: false,
            scanned: sc.scanned,
            since: sc.since,
            pending: 0,
            paused: false,
          });
        }
      } catch (e) {
        if (vigente(gen)) {
          setError(e instanceof Error ? e.message : "No se pudo completar la búsqueda");
          setSearch((s) => ({ ...s, running: false }));
        }
      }
    },
    [commit],
  );

  const cancelSearch = useCallback(() => {
    genRef.current += 1;
    setSearch((s) => ({ ...s, running: false, paused: false }));
  }, []);

  const clearSearch = useCallback(() => {
    genRef.current += 1;
    setSearch(SEARCH_IDLE);
  }, []);

  const gotoHit = useCallback((i: number) => {
    setSearch((s) => {
      if (!s.hits.length) return s;
      const idx = ((i % s.hits.length) + s.hits.length) % s.hits.length;
      setAnchor(s.hits[idx].messageId);
      return { ...s, active: idx };
    });
  }, []);

  // ── Eventos en vivo ─────────────────────────────────────────────────────────

  /**
   * Llega un `mensaje_recibido` de una conversación YA RESUELTA por la pantalla.
   *
   * Recibe la fila, no el id, y por dos razones: la pantalla ya la tiene (o ya la
   * pidió para insertarla en la bandeja), así que pedirla otra vez acá sería el
   * mismo `getConversation` dos veces por evento; y con la fila en mano se puede
   * descartar en CERO requests lo que no es de este número.
   */
  const applyIncoming = useCallback(
    async (conv: Conversation) => {
      const gen = genRef.current;
      if (conv.customer_id !== stateRef.current.customerId) return;
      try {
        if (!stateRef.current.segments.some((s) => s.conv.id === conv.id)) {
          commit(gen, (s) => prependSegment(s, conv));
        }
        const page = await listMessages(conv.id, { limit: MSG_PAGE });
        commit(gen, (s) => applyPage(s, conv.id, undefined, page));
      } catch {
        // Un evento perdido no derriba la pantalla: el hilo sigue en pantalla.
      }
    },
    [commit],
  );

  /** Un cambio de estado (cerrada, escalada, asignada, reactivada). */
  const refreshConversation = useCallback(
    async (conversationId: string) => {
      const gen = genRef.current;
      if (!stateRef.current.segments.some((s) => s.conv.id === conversationId)) return;
      try {
        const conv = await getConversation(conversationId);
        commit(gen, (s) => patchConversation(s, conv));
      } catch {
        /* best-effort */
      }
    },
    [commit],
  );

  /** La respuesta que el propio operador acaba de mandar (viene del POST). */
  const appendOwnMessage = useCallback(
    (conversationId: string, message: Message) => {
      const gen = genRef.current;
      commit(gen, (s) => appendMessage(s, conversationId, message));
    },
    [commit],
  );

  /** Reemplaza la fila de una conversación con la que devolvió una acción. */
  const applyAction = useCallback(
    (conv: Parameters<typeof patchConversation>[1]) => {
      const gen = genRef.current;
      commit(gen, (s) => patchConversation(s, conv));
    },
    [commit],
  );

  const timeline = useMemo(() => buildTimeline(state), [state]);
  const live = useMemo(() => liveSegment(state), [state]);
  const canLoadOlder = useMemo(() => nextToLoad(state).kind !== "done", [state]);
  const canFillDown = useMemo(() => nextToFillDown(state).kind !== "done", [state]);
  const loadedCount = useMemo(
    () => state.segments.reduce((n, s) => n + s.loaded.length, 0),
    [state],
  );
  const openCount = useMemo(
    () => state.segments.filter((s) => segmentLoad(s) !== "none").length,
    [state],
  );

  return {
    state,
    timeline,
    live,
    loading,
    loadingOlder,
    fillingDown,
    error,
    canLoadOlder,
    canFillDown,
    loadedCount,
    openCount,
    anchor,
    clearAnchor: useCallback(() => setAnchor(null), []),
    dateNotice,
    dismissDateNotice: useCallback(() => setDateNotice(null), []),
    search,
    loadOlder,
    fillDown,
    jumpToDate,
    runSearch,
    cancelSearch,
    clearSearch,
    gotoHit,
    applyIncoming,
    refreshConversation,
    appendOwnMessage,
    applyAction,
    // Reintentar es volver a ABRIR el número, no pedir «más historia»: si lo que
    // falló fue el índice, `loadOlder` no tiene de dónde tirar y el error se
    // convertía en un vacío falso.
    retry: useCallback(() => openCustomer(customerId), [openCustomer, customerId]),
  };
}
