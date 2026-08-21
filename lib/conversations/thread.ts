/**
 * El hilo de un NÚMERO: la historia completa de un cliente como una sola lectura.
 *
 * El backend cierra una conversación por inactividad y abre otra cuando el cliente
 * vuelve a escribir, así que una persona son N conversaciones. Acá se cosen en una
 * timeline continua, con un delimitador donde termina cada una.
 *
 * Módulo PURO a propósito (precedente: `lib/schedule/windows.ts`): toda la lógica
 * de encadenado, salto por fecha y búsqueda se prueba sin React y sin MSW, que es
 * lo que permite verificarla por mutación.
 *
 * ## Por qué son N cadenas y no una
 *
 * `GET /conversations/{id}/messages/?before=<msgId>` resuelve el ancla contra
 * `(created_at, id)` **dentro de su propio hilo**, así que ninguna paginación puede
 * cruzar conversaciones. El hilo unificado son N cadenas independientes más un
 * índice; no hay forma de pedirle al servidor «los mensajes de este número».
 *
 * ## Por qué el orden del servidor ya es el orden cronológico
 *
 * Todo escritor de salientes pasa por `get_or_create_active_conversation` y hay un
 * solo `channel_type`, así que hay **a lo sumo una conversación no cerrada por
 * cliente** y sus ventanas de tiempo son disjuntas y ordenadas. Por eso
 * `segments` se queda en el orden `-sort_at,-id` que ya da la API en vez de
 * reordenarse por `created_at`: sería código que no puede cambiar nada.
 *
 * ponytail: con un segundo `channel_type` esa propiedad se rompe y hace falta un
 * merge k-vías entre canales. Hoy no existe; no se paga de antemano.
 */

import type { MessagePage } from "@/lib/api/conversations";
import { dayISO } from "@/lib/format/date";
import type { Conversation, Message } from "@/lib/types";

/** Una conversación del número, con lo que se haya cargado de ella. */
export interface ThreadSegment {
  /** La fila del backend tal cual: `status`, calificación, `created_at`, `last_message_at`. */
  conv: Conversation;
  /** Sus mensajes cargados, ASCENDENTE (viejo → nuevo). */
  loaded: Message[];
  /** Id del más viejo cargado = el `before` de su próxima página. `null` = sin abrir. */
  oldest: string | null;
  /** `has_more` de su última página: hay historia más vieja dentro de ESTA conversación. */
  hasOlder: boolean;
  /**
   * Cero mensajes, sabido sin pedir nada: el backend manda `last_message_preview`
   * vacío. Es el único señalizador honesto y evita gastar una request para
   * descubrir que no hay nada.
   */
  empty: boolean;
}

export interface ThreadState {
  customerId: string;
  /** MÁS NUEVA PRIMERO — el orden que ya da la API. */
  segments: ThreadSegment[];
  /** Cursor opaco del índice (`listConversations`). Se devuelve verbatim. */
  indexCursor: string;
  indexHasMore: boolean;
}

/** Cuánto se cargó de un segmento. */
type SegmentLoad = "none" | "tail" | "full";

export function segmentLoad(s: ThreadSegment): SegmentLoad {
  if (s.empty) return "full";
  if (s.oldest === null) return "none";
  return s.hasOlder ? "tail" : "full";
}

export function initState(customerId: string): ThreadState {
  return { customerId, segments: [], indexCursor: "", indexHasMore: false };
}

function toSegment(conv: Conversation): ThreadSegment {
  return {
    conv,
    loaded: [],
    oldest: null,
    hasOlder: false,
    empty: conv.last_message_preview === "",
  };
}

/** Añade una página del índice al final (más viejas), sin duplicar. */
export function appendIndexPage(
  st: ThreadState,
  page: { items: Conversation[]; next_cursor: string; has_more: boolean },
): ThreadState {
  const known = new Set(st.segments.map((s) => s.conv.id));
  const nuevos = page.items
    // Un hilo es de UN cliente. El servidor ya filtra por `customer_id`, pero el
    // invariante lo hace cumplir el tipo: una fila ajena acá produciría un hilo que
    // mezcla dos personas, y eso no se detecta mirando la pantalla.
    .filter((c) => c.customer_id === st.customerId)
    .filter((c) => !known.has(c.id))
    .map(toSegment);
  return {
    ...st,
    segments: [...st.segments, ...nuevos],
    indexCursor: page.next_cursor,
    indexHasMore: page.has_more,
  };
}

// ── Índices de la región cargada ──────────────────────────────────────────────
// `segments` va de nuevo a viejo, así que un índice MAYOR es más VIEJO.

// Se miran los mensajes CARGADOS, no `segmentLoad`: una conversación sin mensajes
// cuenta como "full" (nunca se le pide una página) y tomarla por «cargada» corría el
// borde del rango. Con [c3 con mensajes, c2 vacía, c1 con mensajes] y nada cargado,
// el borde caía en c2 y la carga arrancaba por c1 —la MÁS VIEJA— dejando c3 sin pedir.

/** Índice del segmento con mensajes más VIEJO, o -1 si no hay ninguno. */
function oldestLoadedIndex(st: ThreadState): number {
  for (let i = st.segments.length - 1; i >= 0; i--) {
    if (st.segments[i].loaded.length > 0) return i;
  }
  return -1;
}

/** Índice del segmento con mensajes más NUEVO, o -1 si no hay ninguno. */
function newestLoadedIndex(st: ThreadState): number {
  for (let i = 0; i < st.segments.length; i++) {
    if (st.segments[i].loaded.length > 0) return i;
  }
  return -1;
}

// ── Qué pedir ─────────────────────────────────────────────────────────────────

type NextLoad =
  | { kind: "messages"; convId: string; before?: string }
  | { kind: "index" }
  | { kind: "done" };

/**
 * Hacia ARRIBA (más viejo). Es el sentido natural de la API.
 *
 * Se mira el segmento cargado más viejo: si le falta cabeza, se pagina con
 * `before`; si está completo, se abre el siguiente más viejo por su página más
 * nueva. Sin nada cargado, se abre el más nuevo. Agotado todo, más índice.
 */
export function nextToLoad(st: ThreadState): NextLoad {
  const hi = oldestLoadedIndex(st);
  if (hi === -1) {
    const primero = st.segments.findIndex((s) => segmentLoad(s) === "none");
    if (primero !== -1)
      return { kind: "messages", convId: st.segments[primero].conv.id };
    return st.indexHasMore ? { kind: "index" } : { kind: "done" };
  }
  const actual = st.segments[hi];
  if (segmentLoad(actual) === "tail") {
    return {
      kind: "messages",
      convId: actual.conv.id,
      before: actual.oldest ?? undefined,
    };
  }
  // Completo: bajar al siguiente más viejo que tenga algo que pedir.
  for (let i = hi + 1; i < st.segments.length; i++) {
    if (segmentLoad(st.segments[i]) !== "full") {
      return { kind: "messages", convId: st.segments[i].conv.id };
    }
  }
  return st.indexHasMore ? { kind: "index" } : { kind: "done" };
}

/**
 * Hacia ABAJO (más nuevo). Existe porque la API **no tiene `after=`**.
 *
 * El hueco entre el bloque anclado y lo que está debajo se rellena de abajo hacia
 * arriba: se pide la página más nueva de la conversación siguiente y se pagina
 * hacia atrás DENTRO de ella hasta que le llega la cabeza. Para una conversación
 * de tamaño normal es un request.
 *
 * Devuelve `done` cuando el bloque cargado ya llega al presente.
 */
export function nextToFillDown(st: ThreadState): NextLoad {
  const hi = oldestLoadedIndex(st);
  if (hi === -1) return { kind: "done" };
  // ADYACENTE PRIMERO, de arriba hacia abajo. No sirve «el cargado más nuevo»:
  // en cuanto el vecino tiene su primera página se lo daría por hecho y saltaría
  // al siguiente, dejando el agujero del medio sin cerrar. Y un segmento solo
  // cierra su hueco cuando está COMPLETO: mientras le falte cabeza sigue habiendo
  // agujero contra el de arriba.
  for (let k = hi - 1; k >= 0; k--) {
    const seg = st.segments[k];
    const estado = segmentLoad(seg);
    if (estado === "full") continue;
    return {
      kind: "messages",
      convId: seg.conv.id,
      before: estado === "tail" ? (seg.oldest ?? undefined) : undefined,
    };
  }
  return { kind: "done" };
}

// ── Aplicar una página ────────────────────────────────────────────────────────

/**
 * DECISIÓN: el refetch del SSE MERGEA la cola, no reemplaza el hilo.
 *
 * Ese refetch trae la página MÁS NUEVA. Si el operador había subido a leer
 * historia, reemplazar le tira las páginas que pidió y el chat salta al fondo
 * justo mientras lee — y basta un mensaje entrante para que pase. Mergear conserva
 * lo que hay y añade solo lo que no se tenía.
 *
 * El caso raro está cubierto: si la página nueva no solapa con NINGÚN mensaje en
 * pantalla, entraron más mensajes que el tamaño de página y mergear dejaría un
 * hueco invisible en medio del chat; ahí sí se reemplaza. Se compara por id, no
 * por posición ni por id mayor: los ids no van en orden de tiempo para filas
 * insertadas con fecha atrasada (lo dice el propio backend al resolver `before`).
 */
export function mergeNewMessages(
  prev: Message[],
  page: MessagePage,
): { messages: Message[]; replaced: boolean } {
  const known = new Set(prev.map((m) => m.id));
  if (!page.items.some((m) => known.has(m.id)))
    return { messages: page.items, replaced: true };
  const nuevos = page.items.filter((m) => !known.has(m.id));
  return { messages: nuevos.length ? [...prev, ...nuevos] : prev, replaced: false };
}

/**
 * Aplica una página de mensajes a su segmento.
 *
 * **Solo si `seg.oldest === before`.** Es la generalización por segmento del doble
 * chequeo que la pantalla ya hacía antes y después del await: sin esto, dos
 * disparos rápidos antepondrían la misma página dos veces y React se queja de la
 * clave duplicada.
 *
 * Una página VACÍA agota el segmento: un `before` desconocido o de otro hilo
 * devuelve `{items: [], has_more: false}`, y sin esta regla el bucle gira para
 * siempre pidiendo lo mismo.
 */
export function applyPage(
  st: ThreadState,
  convId: string,
  before: string | undefined,
  page: MessagePage,
): ThreadState {
  const i = st.segments.findIndex((s) => s.conv.id === convId);
  if (i === -1) return st;
  const seg = st.segments[i];
  // La guarda es SOLO para las páginas hacia atrás. Un refetch de la página más
  // nueva llega siempre con `before: undefined`, y `oldest` ya está puesto desde
  // la primera carga: exigirle que coincida descartaría en silencio todos los
  // eventos del SSE. (Lo encontró el test de merge, no la lectura del código.)
  if (before !== undefined && seg.oldest !== before) return st;

  let loaded: Message[];
  let hasOlder: boolean;
  if (before === undefined) {
    // Página más nueva del segmento: puede ser la primera, o un refetch del SSE.
    const merged = mergeNewMessages(seg.loaded, page);
    loaded = merged.messages;
    hasOlder = merged.replaced ? page.has_more : seg.hasOlder || page.has_more;
  } else {
    loaded = [...page.items, ...seg.loaded];
    hasOlder = page.has_more;
  }

  const segments = [...st.segments];
  segments[i] = {
    ...seg,
    loaded,
    oldest: loaded.length ? loaded[0].id : (seg.oldest ?? ""),
    hasOlder: page.items.length === 0 ? false : hasOlder,
  };
  return { ...st, segments };
}

/**
 * Añade UN mensaje al final de su segmento.
 *
 * Existe porque hacerlo con `applyPage` y una página sintética de un solo mensaje
 * es un bug grave: al no solapar con nada, `mergeNewMessages` REEMPLAZA el tramo
 * cargado por esa única burbuja y apaga `hasOlder`, con lo que el segmento pasa a
 * «completo» y los mensajes anteriores quedan inalcanzables — ni el centinela, ni
 * el empalme, ni el botón del hueco los vuelven a pedir.
 *
 * Aquí `hasOlder` y `oldest` NO se tocan: un mensaje nuevo al final no dice nada
 * sobre cuánta historia falta arriba.
 */
export function appendMessage(
  st: ThreadState,
  convId: string,
  message: Message,
): ThreadState {
  const i = st.segments.findIndex((s) => s.conv.id === convId);
  if (i === -1) return st;
  const seg = st.segments[i];
  if (seg.loaded.some((m) => m.id === message.id)) return st;
  const segments = [...st.segments];
  segments[i] = {
    ...seg,
    loaded: [...seg.loaded, message],
    // Un hilo que estaba sin abrir pasa a tener su cola: el `oldest` es este
    // mensaje y sigue faltando historia arriba, que es la verdad.
    oldest: seg.oldest ?? message.id,
    hasOlder: seg.oldest === null ? true : seg.hasOlder,
    empty: false,
  };
  return { ...st, segments };
}

/** Reemplaza la fila de un segmento (SSE de estado) sin tocar sus mensajes. */
export function patchConversation(st: ThreadState, conv: Conversation): ThreadState {
  const i = st.segments.findIndex((s) => s.conv.id === conv.id);
  if (i === -1) return st;
  const segments = [...st.segments];
  segments[i] = { ...segments[i], conv };
  return { ...st, segments };
}

/** Antepone un segmento recién creado por el backend (conversación nueva). */
export function prependSegment(st: ThreadState, conv: Conversation): ThreadState {
  if (st.segments.some((s) => s.conv.id === conv.id)) return st;
  return { ...st, segments: [toSegment(conv), ...st.segments] };
}

/** El único segmento sobre el que las acciones pueden actuar, o `null`. */
export function liveSegment(st: ThreadState): ThreadSegment | null {
  return st.segments.find((s) => s.conv.status !== "closed") ?? null;
}

// ── La timeline ───────────────────────────────────────────────────────────────

type TimelineItem =
  | { kind: "day"; key: string; iso: string }
  | { kind: "message"; key: string; message: Message; convId: string }
  | { kind: "boundary"; key: string; seg: ThreadSegment }
  /** Agujero DENTRO de la región cargada: falta una conversación entera o su cabeza. */
  | { kind: "gap"; key: string; seg: ThreadSegment };

/**
 * Deriva la lectura de arriba (viejo) a abajo (nuevo).
 *
 * La distinción que importa: lo que falta ARRIBA de la región cargada no es un
 * agujero, es historia sin pedir todavía — de eso se ocupa el centinela de scroll.
 * Un `gap` se emite solo **dentro** de la región cargada, o inmediatamente debajo
 * de ella cuando se llegó por un salto de fecha y todavía falta empalmar con el
 * presente. Un scroll que teletransporta sin avisar es peor que una espera visible.
 *
 * El `boundary` NO se emite para el segmento más nuevo: su estado ya lo dicen la
 * cabecera y el composer, y un delimitador pegado al input se lee como si hubiera
 * algo debajo.
 */
export function buildTimeline(st: ThreadState): TimelineItem[] {
  const hi = oldestLoadedIndex(st);
  const lo = newestLoadedIndex(st);
  if (hi === -1) return [];

  const items: TimelineItem[] = [];
  let dia = "";

  for (let i = hi; i >= lo; i--) {
    const seg = st.segments[i];
    const estado = segmentLoad(seg);

    // Un agujero interno: la conversación no está, o le falta la cabeza. El de
    // MÁS ARRIBA no cuenta — ahí el centinela pide más historia.
    if (i !== hi && estado !== "full") {
      items.push({ kind: "gap", key: `gap-${seg.conv.id}`, seg });
      dia = "";
    }

    for (const m of seg.loaded) {
      const d = dayISO(new Date(m.created_at));
      if (d !== dia) {
        dia = d;
        items.push({ kind: "day", key: `day-${seg.conv.id}-${d}`, iso: m.created_at });
      }
      items.push({
        kind: "message",
        key: `m-${m.id}`,
        message: m,
        convId: seg.conv.id,
      });
    }

    if (i > 0) items.push({ kind: "boundary", key: `b-${seg.conv.id}`, seg });
  }

  // Anclado por una fecha: debajo del bloque todavía falta llegar al presente.
  if (lo > 0) {
    const siguiente = st.segments[lo - 1];
    items.push({ kind: "gap", key: `gap-down-${siguiente.conv.id}`, seg: siguiente });
  }
  return items;
}

// ── Salto por fecha ───────────────────────────────────────────────────────────

export type DateTarget =
  /** La fecha cae dentro de la ventana de esta conversación. */
  | { kind: "hit"; convId: string }
  /** Posterior a todo el historial: al fondo, cero requests. */
  | { kind: "after-all" }
  /** Anterior al índice conocido, y hay más índice que pedir. */
  | { kind: "need-index" }
  /** Anterior a todo, con el índice completo: afirmable solo entonces. */
  | { kind: "before-all"; firstDay: string }
  /** Nadie escribió ese día: se ofrecen los dos vecinos, sin elegir lado. */
  | { kind: "gap"; newer: string; older: string };

/**
 * En qué conversación cae un día, resuelto sobre el índice ya en memoria.
 *
 * **Cero requests**: es un escaneo lineal sobre ≤100 filas, y funciona porque las
 * ventanas son disjuntas y ordenadas (ver el encabezado del módulo). Un segmento
 * `empty` no tiene ventana y nunca es candidato.
 *
 * En un hueco NO se elige lado: anclar en la conversación posterior exigiría su
 * PRIMER mensaje, o sea cargarla entera — el caso caro disfrazado de default.
 */
export function targetForDate(st: ThreadState, day: string): DateTarget {
  const conVentana = st.segments.filter((s) => !s.empty);
  if (conVentana.length === 0) {
    return st.indexHasMore ? { kind: "need-index" } : { kind: "after-all" };
  }
  // `segments` va de nuevo a viejo.
  const masNuevo = conVentana[0];
  if (day > dayISO(new Date(masNuevo.conv.last_message_at)))
    return { kind: "after-all" };

  for (let i = 0; i < conVentana.length; i++) {
    const s = conVentana[i];
    const desde = dayISO(new Date(s.conv.created_at));
    const hasta = dayISO(new Date(s.conv.last_message_at));
    if (day >= desde && day <= hasta) return { kind: "hit", convId: s.conv.id };
    if (day > hasta) {
      // Cae entre esta y la anterior (más nueva): hueco.
      return { kind: "gap", newer: conVentana[i - 1].conv.id, older: s.conv.id };
    }
  }

  const masViejo = conVentana[conVentana.length - 1];
  if (st.indexHasMore) return { kind: "need-index" };
  return { kind: "before-all", firstDay: dayISO(new Date(masViejo.conv.created_at)) };
}

// ── Búsqueda de contenido ─────────────────────────────────────────────────────

/**
 * Insensible a mayúsculas y ACENTOS.
 *
 * Mismo criterio que usa el backend para buscar nombres de cliente (`unaccent`),
 * así los dos buscadores del panel no se contradicen: si «Martín» matchea
 * «martin» en la bandeja, «café» tiene que matchear «cafe» acá.
 */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function matches(text: string, query: string): boolean {
  const q = normalize(query.trim());
  return q !== "" && normalize(text).includes(q);
}

/**
 * Parte un texto en tramos, marcando las coincidencias.
 *
 * Devuelve datos, no HTML: quien renderiza pone `<mark>`. **Nunca**
 * `dangerouslySetInnerHTML` — esto es texto de WhatsApp escrito por un cliente.
 *
 * Los índices se calculan sobre el texto NORMALIZADO y se aplican al ORIGINAL, y
 * eso funciona porque `normalize` no cambia el largo: quita diacríticos de la
 * forma descompuesta y baja a minúsculas, ambas 1 a 1 en la práctica de este
 * corpus. Si algún día entra un carácter que se expande (ẛ → ss), los tramos se
 * corren; el precio de la alternativa es un mapa de índices por mensaje.
 */
export function splitHighlight(
  text: string,
  query: string,
): { text: string; hit: boolean }[] {
  const q = normalize(query.trim());
  if (q === "") return [{ text, hit: false }];
  const hay = normalize(text);
  if (hay.length !== text.length) return [{ text, hit: false }];

  const tramos: { text: string; hit: boolean }[] = [];
  let i = 0;
  for (;;) {
    const at = hay.indexOf(q, i);
    if (at === -1) break;
    if (at > i) tramos.push({ text: text.slice(i, at), hit: false });
    tramos.push({ text: text.slice(at, at + q.length), hit: true });
    i = at + q.length;
  }
  if (i < text.length) tramos.push({ text: text.slice(i), hit: false });
  return tramos.length ? tramos : [{ text, hit: false }];
}

export interface SearchHit {
  messageId: string;
  convId: string;
  createdAt: string;
  text: string;
}

/** Coincidencias en lo YA cargado, de más nueva a más vieja. */
export function searchLoaded(st: ThreadState, query: string): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const seg of st.segments) {
    for (const m of seg.loaded) {
      if (matches(m.text, query)) {
        hits.push({
          messageId: m.id,
          convId: seg.conv.id,
          createdAt: m.created_at,
          text: m.text,
        });
      }
    }
  }
  return hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Cuántos mensajes se revisaron y desde cuándo — el alcance que se muestra. */
export function searchScope(st: ThreadState): {
  scanned: number;
  since: string | null;
} {
  let scanned = 0;
  let since: string | null = null;
  for (const seg of st.segments) {
    scanned += seg.loaded.length;
    const primero = seg.loaded[0];
    if (primero && (since === null || primero.created_at < since))
      since = primero.created_at;
  }
  return { scanned, since };
}

/** Conversaciones del número que todavía no se revisaron enteras. */
export function pendingToScan(st: ThreadState): ThreadSegment[] {
  return st.segments.filter((s) => segmentLoad(s) !== "full");
}
