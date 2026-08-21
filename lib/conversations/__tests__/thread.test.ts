/**
 * La lógica del hilo por número, probada sin React y sin MSW.
 *
 * Es el check que importa de todo el rediseño: el encadenado de N conversaciones,
 * el relleno hacia abajo (que existe porque la API no tiene `after=`), el salto por
 * fecha y la búsqueda son funciones puras. Si algo de esto se rompe, falla acá y no
 * en un test de pantalla donde la causa queda a tres capas de distancia.
 */
import { describe, expect, it } from "vitest";

import {
  appendIndexPage,
  appendMessage,
  applyPage,
  buildTimeline,
  initState,
  liveSegment,
  matches,
  nextToFillDown,
  nextToLoad,
  searchScope,
  segmentLoad,
  splitHighlight,
  targetForDate,
  type ThreadState,
} from "@/lib/conversations/thread";
import type { Conversation, Message } from "@/lib/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function conv(
  id: string,
  desde: string,
  hasta: string,
  extra: Partial<Conversation> = {},
) {
  return {
    id,
    customer_id: "7",
    customer_name: "Ana",
    customer_phone: "56911112222",
    status: "closed",
    active_agent: null,
    assignee_id: null,
    last_message_at: hasta,
    created_at: desde,
    unread: 0,
    customer_rating: null,
    rating_status: "pending",
    customer_rating_avg: null,
    customer_rating_count: 0,
    // No vacío: si fuera "" el segmento se marcaría `empty` y nunca se le pediría
    // una página, que es justo lo contrario de lo que estos casos ejercitan.
    last_message_preview: "hola",
    last_message_direction: "in",
    last_message_sender_kind: "",
    ...extra,
  } satisfies Conversation;
}

function msg(id: string, iso: string, text = "hola"): Message {
  return {
    id,
    conversation_id: "c",
    direction: "inbound",
    sender: "customer",
    text,
    created_at: iso,
  };
}

/** Tres conversaciones, de más nueva a más vieja, como las devuelve la API. */
function conTres(): ThreadState {
  return appendIndexPage(initState("7"), {
    items: [
      conv("c3", "2026-08-10T09:00:00Z", "2026-08-10T18:00:00Z", {
        status: "ai_active",
      }),
      conv("c2", "2026-06-05T09:00:00Z", "2026-06-06T18:00:00Z"),
      conv("c1", "2026-03-01T09:00:00Z", "2026-03-02T18:00:00Z"),
    ],
    next_cursor: "",
    has_more: false,
  });
}

const pag = (items: Message[], has_more = false) => ({ items, has_more });

// ── Índice y estado de un segmento ────────────────────────────────────────────

describe("índice", () => {
  it("no duplica al pedir más índice y arrastra el cursor", () => {
    let st = conTres();
    st = appendIndexPage(st, {
      items: [
        conv("c3", "x", "y"),
        conv("c0", "2025-01-01T09:00:00Z", "2025-01-01T10:00:00Z"),
      ],
      next_cursor: "abc",
      has_more: true,
    });
    expect(st.segments.map((s) => s.conv.id)).toEqual(["c3", "c2", "c1", "c0"]);
    expect(st.indexCursor).toBe("abc");
    expect(st.indexHasMore).toBe(true);
  });

  it("una conversación sin mensajes se marca completa sin pedirle nada", () => {
    const st = appendIndexPage(initState("7"), {
      items: [conv("v", "a", "b", { last_message_preview: "" })],
      next_cursor: "",
      has_more: false,
    });
    expect(st.segments[0].empty).toBe(true);
    expect(segmentLoad(st.segments[0])).toBe("full");
    expect(nextToLoad(st)).toEqual({ kind: "done" });
  });
});

// ── Qué pedir hacia arriba ────────────────────────────────────────────────────

describe("nextToLoad (hacia lo más viejo)", () => {
  it("abre la más nueva, la pagina, y al agotarla cruza a la anterior", () => {
    let st = conTres();
    expect(nextToLoad(st)).toEqual({ kind: "messages", convId: "c3" });

    // Primera página de c3, con más historia dentro de c3.
    st = applyPage(st, "c3", undefined, pag([msg("30", "2026-08-10T17:00:00Z")], true));
    expect(nextToLoad(st)).toEqual({ kind: "messages", convId: "c3", before: "30" });

    // Se agota c3 → cruza a c2 por su página más nueva, SIN `before`.
    st = applyPage(st, "c3", "30", pag([msg("29", "2026-08-10T16:00:00Z")], false));
    expect(nextToLoad(st)).toEqual({ kind: "messages", convId: "c2" });
  });

  it("agotado todo pide índice, y sin más índice termina", () => {
    let st = conTres();
    for (const id of ["c3", "c2", "c1"]) {
      st = applyPage(
        st,
        id,
        undefined,
        pag([msg(`${id}-a`, "2026-01-01T10:00:00Z")], false),
      );
    }
    expect(nextToLoad(st)).toEqual({ kind: "done" });

    const conMas: ThreadState = { ...st, indexHasMore: true };
    expect(nextToLoad(conMas)).toEqual({ kind: "index" });
  });
});

it("una conversación VACÍA en el medio no desvía la carga a la más vieja", () => {
  // El borde del rango se calcula con los mensajes cargados, no con «este segmento
  // no hay que pedirlo»: si no, una conversación sin mensajes corría el borde y la
  // primera carga empezaba por la más vieja del historial.
  let st = appendIndexPage(initState("7"), {
    items: [
      conv("n3", "2026-08-10T09:00:00Z", "2026-08-10T18:00:00Z"),
      conv("n2", "2026-06-05T09:00:00Z", "2026-06-05T09:00:00Z", {
        last_message_preview: "",
      }),
      conv("n1", "2026-03-01T09:00:00Z", "2026-03-02T18:00:00Z"),
    ],
    next_cursor: "",
    has_more: false,
  });
  expect(nextToLoad(st)).toEqual({ kind: "messages", convId: "n3" });

  st = applyPage(st, "n3", undefined, pag([msg("30", "2026-08-10T18:00:00Z")], false));
  // Agotada la más nueva, la vacía se saltea y se sigue por la siguiente con mensajes.
  expect(nextToLoad(st)).toEqual({ kind: "messages", convId: "n1" });
});

// ── Qué pedir hacia abajo (no hay `after=`) ───────────────────────────────────

describe("nextToFillDown (hacia el presente)", () => {
  it("empalma el hueco adyacente en dos páginas y deja de pedir al cerrarlo", () => {
    let st = conTres();
    // Salto por fecha: solo c1 (la más vieja) cargada y completa.
    st = applyPage(
      st,
      "c1",
      undefined,
      pag([msg("10", "2026-03-02T18:00:00Z")], false),
    );

    // El vecino de abajo es c2 y va primero, aunque c3 también esté sin cargar:
    // rellenar salteado dejaría un agujero en medio.
    expect(nextToFillDown(st)).toEqual({ kind: "messages", convId: "c2" });

    // Su página más nueva llega, pero le falta cabeza: sigue siendo c2.
    st = applyPage(st, "c2", undefined, pag([msg("20", "2026-06-06T18:00:00Z")], true));
    expect(nextToFillDown(st)).toEqual({
      kind: "messages",
      convId: "c2",
      before: "20",
    });

    // Ya completa: recién ahora pasa a c3.
    st = applyPage(st, "c2", "20", pag([msg("19", "2026-06-05T09:00:00Z")], false));
    expect(nextToFillDown(st)).toEqual({ kind: "messages", convId: "c3" });

    // Con todo el camino al presente cerrado, no hay nada que rellenar.
    st = applyPage(
      st,
      "c3",
      undefined,
      pag([msg("30", "2026-08-10T18:00:00Z")], false),
    );
    expect(nextToFillDown(st)).toEqual({ kind: "done" });
  });

  it("no confunde «falta historia arriba» con «falta empalmar abajo»", () => {
    // Caso normal de apertura: solo la más nueva, y con historia propia pendiente.
    let st = conTres();
    st = applyPage(st, "c3", undefined, pag([msg("30", "2026-08-10T18:00:00Z")], true));
    // Hacia arriba hay trabajo; hacia abajo NO: ya se está en el presente.
    expect(nextToLoad(st)).toEqual({ kind: "messages", convId: "c3", before: "30" });
    expect(nextToFillDown(st)).toEqual({ kind: "done" });
  });
});

// ── Aplicar páginas ───────────────────────────────────────────────────────────

describe("applyPage", () => {
  it("descarta una página cuyo `before` ya no es el del segmento", () => {
    let st = conTres();
    st = applyPage(st, "c3", undefined, pag([msg("30", "2026-08-10T18:00:00Z")], true));
    const antes = st;
    // Dos disparos rápidos: el segundo llega con un ancla vieja.
    st = applyPage(st, "c3", "99", pag([msg("28", "2026-08-10T15:00:00Z")], true));
    expect(st).toBe(antes);
    expect(st.segments[0].loaded.map((m) => m.id)).toEqual(["30"]);
  });

  it("una página vacía agota el segmento AUNQUE diga que hay más", () => {
    // El `has_more: true` es lo que hace este caso peligroso: sin agotar por
    // «vino vacía», `nextToLoad` pediría eternamente el mismo `before` y el
    // panel giraría contra la API. Hoy el backend manda `has_more: false` en esa
    // respuesta, así que la guarda es defensiva a propósito — y con `false` el
    // test no probaría nada, porque el segmento se agotaría por el otro camino.
    let st = conTres();
    st = applyPage(st, "c3", undefined, pag([msg("30", "2026-08-10T18:00:00Z")], true));
    st = applyPage(st, "c3", "30", pag([], true));
    expect(segmentLoad(st.segments[0])).toBe("full");
    expect(nextToLoad(st)).toEqual({ kind: "messages", convId: "c2" });
  });

  it("un refetch que solapa mergea la cola en vez de tirar la historia leída", () => {
    let st = conTres();
    st = applyPage(st, "c3", undefined, pag([msg("30", "2026-08-10T17:00:00Z")], true));
    st = applyPage(st, "c3", "30", pag([msg("29", "2026-08-10T16:00:00Z")], false));
    // El SSE re-pide la página más nueva: trae "30" (conocido) y "31" (nuevo).
    st = applyPage(
      st,
      "c3",
      undefined,
      pag([msg("30", "2026-08-10T17:00:00Z"), msg("31", "2026-08-10T19:00:00Z")], true),
    );
    expect(st.segments[0].loaded.map((m) => m.id)).toEqual(["29", "30", "31"]);
  });

  it("una página que no solapa reemplaza, porque mergear dejaría un hueco invisible", () => {
    let st = conTres();
    st = applyPage(st, "c3", undefined, pag([msg("30", "2026-08-10T17:00:00Z")], true));
    st = applyPage(st, "c3", undefined, pag([msg("80", "2026-08-11T10:00:00Z")], true));
    expect(st.segments[0].loaded.map((m) => m.id)).toEqual(["80"]);
  });
});

describe("appendMessage", () => {
  it("añade al final SIN tirar la historia ya cargada", () => {
    // El bug que esto fija: hacerlo con `applyPage` y una página sintética de un
    // solo mensaje no solapa con nada, así que `mergeNewMessages` REEMPLAZABA los
    // 50 mensajes por la burbuja propia y marcaba el segmento como completo — la
    // historia quedaba inalcanzable para siempre.
    let st = conTres();
    st = applyPage(
      st,
      "c3",
      undefined,
      pag([msg("28", "2026-08-10T16:00:00Z"), msg("29", "2026-08-10T17:00:00Z")], true),
    );
    const antes = st.segments[0];

    st = appendMessage(st, "c3", msg("mio", "2026-08-10T18:00:00Z", "respondo yo"));

    const seg = st.segments[0];
    expect(seg.loaded.map((m) => m.id)).toEqual(["28", "29", "mio"]);
    // Un mensaje nuevo al final no dice nada de la historia de arriba.
    expect(seg.hasOlder).toBe(antes.hasOlder);
    expect(seg.oldest).toBe(antes.oldest);
    expect(segmentLoad(seg)).toBe("tail");
    expect(nextToLoad(st)).toEqual({ kind: "messages", convId: "c3", before: "28" });
  });

  it("no duplica si el mensaje ya está", () => {
    let st = conTres();
    st = applyPage(
      st,
      "c3",
      undefined,
      pag([msg("30", "2026-08-10T18:00:00Z")], false),
    );
    const igual = st;
    st = appendMessage(st, "c3", msg("30", "2026-08-10T18:00:00Z"));
    expect(st).toBe(igual);
  });

  it("en un segmento sin abrir deja constancia de que falta historia arriba", () => {
    let st = conTres();
    st = appendMessage(st, "c2", msg("nuevo", "2026-06-06T19:00:00Z"));
    const seg = st.segments[1];
    expect(seg.loaded.map((m) => m.id)).toEqual(["nuevo"]);
    // «tail», no «full»: tiene su cola y le falta la cabeza. Declararlo completo
    // dejaría la conversación entera fuera del alcance de cualquier carga.
    expect(segmentLoad(seg)).toBe("tail");
  });
});

// ── La timeline ───────────────────────────────────────────────────────────────

describe("buildTimeline", () => {
  it("ordena viejo → nuevo, pone un delimitador por conversación salvo la más nueva", () => {
    let st = conTres();
    for (const [id, iso] of [
      ["c3", "2026-08-10T18:00:00Z"],
      ["c2", "2026-06-06T18:00:00Z"],
      ["c1", "2026-03-02T18:00:00Z"],
    ] as const) {
      st = applyPage(st, id, undefined, pag([msg(`m-${id}`, iso)], false));
    }
    const t = buildTimeline(st);
    expect(t.filter((i) => i.kind === "message").map((i) => i.key)).toEqual([
      "m-m-c1",
      "m-m-c2",
      "m-m-c3",
    ]);
    // Dos delimitadores, no tres: el de la más nueva no se emite.
    expect(t.filter((i) => i.kind === "boundary").map((i) => i.key)).toEqual([
      "b-c1",
      "b-c2",
    ]);
    expect(t.filter((i) => i.kind === "gap")).toEqual([]);
  });

  it("un separador de día por día, no por mensaje", () => {
    let st = conTres();
    st = applyPage(
      st,
      "c3",
      undefined,
      pag(
        [
          msg("1", "2026-08-10T09:00:00Z"),
          msg("2", "2026-08-10T18:00:00Z"),
          msg("3", "2026-08-11T09:00:00Z"),
        ],
        false,
      ),
    );
    expect(buildTimeline(st).filter((i) => i.kind === "day")).toHaveLength(2);
  });

  it("dibuja el hueco mientras falta empalmar con el presente, y lo quita al cerrarlo", () => {
    let st = conTres();
    st = applyPage(
      st,
      "c1",
      undefined,
      pag([msg("10", "2026-03-02T18:00:00Z")], false),
    );
    // Anclado en lo viejo: hay un agujero hacia abajo.
    expect(buildTimeline(st).filter((i) => i.kind === "gap")).toHaveLength(1);

    st = applyPage(
      st,
      "c2",
      undefined,
      pag([msg("20", "2026-06-06T18:00:00Z")], false),
    );
    st = applyPage(
      st,
      "c3",
      undefined,
      pag([msg("30", "2026-08-10T18:00:00Z")], false),
    );
    expect(buildTimeline(st).filter((i) => i.kind === "gap")).toEqual([]);
  });

  it("lo que falta ARRIBA no es un hueco: es historia sin pedir", () => {
    let st = conTres();
    // Solo la más nueva y a medias: no debe dibujarse ningún hueco.
    st = applyPage(st, "c3", undefined, pag([msg("30", "2026-08-10T18:00:00Z")], true));
    expect(buildTimeline(st).filter((i) => i.kind === "gap")).toEqual([]);
  });
});

// ── El segmento vivo ──────────────────────────────────────────────────────────

describe("liveSegment", () => {
  it("es la única conversación no cerrada, y null si todas están cerradas", () => {
    const st = conTres();
    expect(liveSegment(st)?.conv.id).toBe("c3");

    const todasCerradas: ThreadState = {
      ...st,
      segments: st.segments.map((s) => ({
        ...s,
        conv: { ...s.conv, status: "closed" },
      })),
    };
    expect(liveSegment(todasCerradas)).toBeNull();
  });
});

// ── Salto por fecha ───────────────────────────────────────────────────────────

describe("targetForDate", () => {
  it("acierta la conversación cuya ventana contiene el día", () => {
    expect(targetForDate(conTres(), "2026-06-05")).toEqual({
      kind: "hit",
      convId: "c2",
    });
    expect(targetForDate(conTres(), "2026-03-02")).toEqual({
      kind: "hit",
      convId: "c1",
    });
  });

  it("una fecha posterior a todo va al presente sin pedir nada", () => {
    expect(targetForDate(conTres(), "2026-12-31")).toEqual({ kind: "after-all" });
  });

  it("en un hueco ofrece los dos vecinos y no elige lado", () => {
    expect(targetForDate(conTres(), "2026-07-01")).toEqual({
      kind: "gap",
      newer: "c3",
      older: "c2",
    });
  });

  it("antes de todo: afirma el inicio solo con el índice completo, si no pide más", () => {
    expect(targetForDate(conTres(), "2020-01-01")).toEqual({
      kind: "before-all",
      firstDay: "2026-03-01",
    });
    const parcial: ThreadState = { ...conTres(), indexHasMore: true };
    expect(targetForDate(parcial, "2020-01-01")).toEqual({ kind: "need-index" });
  });
});

// ── Búsqueda ──────────────────────────────────────────────────────────────────

describe("búsqueda", () => {
  it("ignora mayúsculas y acentos, como el buscador de la bandeja", () => {
    expect(matches("Quiero un CAFÉ", "cafe")).toBe(true);
    expect(matches("Martín", "martin")).toBe(true);
    expect(matches("hola", "")).toBe(false);
  });

  it("parte el texto marcando las coincidencias, sobre el original", () => {
    expect(splitHighlight("Un café y otro CAFÉ", "café")).toEqual([
      { text: "Un ", hit: false },
      { text: "café", hit: true },
      { text: " y otro ", hit: false },
      { text: "CAFÉ", hit: true },
    ]);
  });

  it("sin coincidencia devuelve el texto entero de una pieza", () => {
    expect(splitHighlight("hola", "adios")).toEqual([{ text: "hola", hit: false }]);
  });

  it("el alcance dice cuántos mensajes se revisaron y desde cuándo", () => {
    let st = conTres();
    st = applyPage(st, "c3", undefined, pag([msg("30", "2026-08-10T18:00:00Z")], true));
    st = applyPage(st, "c2", undefined, pag([msg("20", "2026-06-06T18:00:00Z")], true));
    expect(searchScope(st)).toEqual({ scanned: 2, since: "2026-06-06T18:00:00Z" });
  });
});
