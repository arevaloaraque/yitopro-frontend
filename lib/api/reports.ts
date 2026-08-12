import { api } from "./client";

/**
 * Reportes de valor (`/api/reports/`), solo para el dueño (el backend responde
 * 403 al staff). La ventana es OBLIGATORIA y en días de calendario inclusivos:
 * sin ella cada agregación sería un escaneo completo del historial del tenant.
 *
 * Los Decimales del backend viajan como STRING ("5000.00") y aquí se convierten
 * a number — el mismo criterio que `lib/api/payments.ts`. La moneda NUNCA se
 * asume: cada serie, total y fila de composición trae su `currency`, y quien
 * formatea usa `formatPrice(amount, currency)` por fila.
 */

export interface ReportWindow {
  /** `YYYY-MM-DD`, día LOCAL del navegador (no UTC). */
  date_from: string;
  date_to: string;
  /** Largo de la ventana en días, contando ambos extremos. */
  days: number;
}

export type ReportPeriod = "7" | "30" | "90" | "custom";

/** Las dos fechas de un rango personalizado, tal como las escribe un
 *  `<input type="date">` (`YYYY-MM-DD`, día local). */
export interface CustomRange {
  from: string;
  to: string;
}

/**
 * UN solo tope, el mismo que valida el backend (`MAX_RANGE_DAYS` de
 * `apps/reports/api.py`): la ventana inclusiva no pasa de 90 días.
 *
 * Antes había dos —366 para «desde el inicio» y 90 para el rango a mano—, y esa
 * asimetría era la puerta trasera: el preset podía pedir un año de agregaciones
 * mientras el rango escrito a mano se quedaba en un trimestre. Detrás de cada
 * ventana hay media docena de agregaciones sobre el historial del tenant, así que
 * el techo es uno y vale para todos los caminos: preset, rango personalizado y
 * URL escrita a mano.
 */
export const MAX_RANGE_DAYS = 90;

/** Una fila de ranking de la agenda: profesional o servicio, con su conteo. */
export interface AgendaRankRow {
  id: number;
  name: string;
  scheduled: number;
}

export interface ValueSummary {
  core: {
    replies: { ai: number; operator: number };
    handoffs: {
      total: number;
      resolved: number;
      /**
       * Diccionario ABIERTO, igual que el schema del backend (`dict[str, int]`).
       * Declararlo con las cuatro claves de hoy hacía que un quinto motivo
       * añadido al enum viajara en la respuesta y desapareciera del tipo, que
       * es la forma silenciosa de perder un dato nuevo.
       */
      by_trigger: Record<string, number>;
    };
    /** null cuando ningún inbound tuvo respuesta de la IA dentro del recorte. */
    response_time: {
      median_s: number;
      p90_s: number;
      n: number;
      n_total: number;
      cutoff_s: number;
    } | null;
    out_of_hours: { inbound_outside: number; schedule_configured: boolean };
    ai_activity: { calls: number; errors: number };
  };
  blocks: {
    /**
     * null = el dominio no existe para este negocio: no se dibuja nada.
     *
     * Dentro del bloque cada clave tiene su PROPIO gate, porque miden cosas
     * distintas: `ai_active_count` mide al asistente (null si el negocio nunca
     * agendó por IA) y los dos rankings miden la operación del negocio (null si
     * no hay ninguna cita vigente). Un negocio que agenda solo desde el panel
     * ve sus rankings con `ai_active_count` en null, y al revés.
     */
    appointments: {
      ai_active_count: number | null;
      by_professional: AgendaRankRow[] | null;
      by_service: AgendaRankRow[] | null;
    } | null;
    orders: { ai_confirmed_count: number } | null;
    /**
     * Lo más vendido de la tienda, en UNIDADES (el pedido no tiene moneda).
     * null = el negocio nunca confirmó una línea de pedido.
     */
    products: {
      top: { id: number; name: string; units: number; orders: number }[];
    } | null;
    /**
     * Cómo se COMPORTARON los clientes según el evaluador, NO su satisfacción:
     * la escala puntúa la conducta del cliente (1 = hostil … 5 = excelente) y
     * un promedio bajo describe clientes difíciles, jamás un servicio malo.
     * null = ninguna conversación calificada en toda la vida del negocio.
     */
    customers: {
      /** null cuando la ventana no tiene ninguna nota: en una escala que
       *  empieza en 1, un promedio de 0 no existe. */
      average: number | null;
      rated: number;
      /** Conversaciones del período que todavía esperan nota: es lo que permite
       *  leer un `rated` bajo sin confundirlo con «nadie escribió». */
      pending: number;
      distribution: { stars: number; conversations: number }[];
    } | null;
    payments: {
      series: {
        day: string;
        currency: string;
        paid_amount: number;
        paid_count: number;
      }[];
      totals: { currency: string; paid_amount: number; paid_count: number }[];
      /** Ventana anterior de igual largo; con pocos cobros no es comparable. */
      previous: { currency: string; paid_amount: number; paid_count: number }[];
      composition: {
        kind: "order" | "appointment" | "standalone";
        currency: string;
        amount: number;
        count: number;
      }[];
      links: { created: number; opened: number; paid: number };
    } | null;
  };
}

// La forma del backend es la misma salvo los montos: `string` Decimal ahí,
// number acá. Se declara aparte para que el mapeo quede a la vista.
interface BackendMoneyRow {
  currency: string;
  paid_amount: string;
  paid_count: number;
}

interface BackendValueSummary {
  core: ValueSummary["core"];
  blocks: {
    appointments: ValueSummary["blocks"]["appointments"];
    orders: { ai_confirmed_count: number } | null;
    /**
     * Lo más vendido de la tienda, en UNIDADES (el pedido no tiene moneda).
     * null = el negocio nunca confirmó una línea de pedido.
     */
    products: {
      top: { id: number; name: string; units: number; orders: number }[];
    } | null;
    /**
     * Cómo se COMPORTARON los clientes según el evaluador, NO su satisfacción:
     * la escala puntúa la conducta del cliente (1 = hostil … 5 = excelente) y
     * un promedio bajo describe clientes difíciles, jamás un servicio malo.
     * null = ninguna conversación calificada en toda la vida del negocio.
     */
    customers: {
      /** null cuando la ventana no tiene ninguna nota: en una escala que
       *  empieza en 1, un promedio de 0 no existe. */
      average: number | null;
      rated: number;
      /** Conversaciones del período que todavía esperan nota: es lo que permite
       *  leer un `rated` bajo sin confundirlo con «nadie escribió». */
      pending: number;
      distribution: { stars: number; conversations: number }[];
    } | null;
    payments: {
      series: {
        day: string;
        currency: string;
        paid_amount: string;
        paid_count: number;
      }[];
      totals: BackendMoneyRow[];
      previous: BackendMoneyRow[];
      composition: {
        kind: "order" | "appointment" | "standalone";
        currency: string;
        amount: string;
        count: number;
      }[];
      links: { created: number; opened: number; paid: number };
    } | null;
  };
}

const toMoneyRow = (r: BackendMoneyRow) => ({
  ...r,
  paid_amount: Number(r.paid_amount),
});

function fromBackend(raw: BackendValueSummary): ValueSummary {
  const payments = raw.blocks.payments;
  return {
    core: raw.core,
    blocks: {
      appointments: raw.blocks.appointments,
      orders: raw.blocks.orders,
      products: raw.blocks.products,
      customers: raw.blocks.customers,
      payments: payments
        ? {
            ...payments,
            series: payments.series.map((r) => ({
              ...r,
              paid_amount: Number(r.paid_amount),
            })),
            totals: payments.totals.map(toMoneyRow),
            previous: payments.previous.map(toMoneyRow),
            composition: payments.composition.map((r) => ({
              ...r,
              amount: Number(r.amount),
            })),
          }
        : null,
    },
  };
}

/** El día `YYYY-MM-DD` en la zona LOCAL del navegador — `toISOString()` daría
 *  el día UTC y la ventana se correría una fecha (criterio de `customWindow`
 *  de payments: medianoche local, no UTC). */
function ymdLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Medianoche LOCAL del día que contiene `iso` (un `created_at` ISO 8601). */
function localDayStart(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** «Hoy» en la zona del operador. `toISOString().slice(0,10)` daría el día UTC:
 *  en Chile, pasadas las 20:00 el campo «hasta» arrancaría en mañana y su propio
 *  `max` lo daría por inválido. `sv-SE` es el locale que formatea `YYYY-MM-DD`,
 *  que es justo lo que acepta un `<input type="date">`. */
export function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/**
 * Cadena vacía cuando el par de fechas sirve; el motivo, cuando no.
 *
 * El tope es el MISMO `MAX_WINDOW_DAYS` que el backend valida, así que un rango
 * aceptado aquí no puede devolver 400 allá: una sola fuente para el límite.
 */
export function customRangeError(from: string, to: string): string {
  if (!from || !to) return "Selecciona las dos fechas.";
  if (to < from) return "La fecha final es anterior a la inicial.";
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) return `El rango no puede superar ${MAX_RANGE_DAYS} días.`;
  return "";
}

/**
 * La ventana de un período, en días locales inclusivos.
 *
 * - `7 | 30 | 90`: los últimos N días terminando hoy.
 * - `custom`: el par que escribió el operador. Con un par inválido —a medio
 *   escribir, invertido o pasado de tope— NO se inventa una ventana: se cae al
 *   preset más largo, que siempre existe. Quien llama muestra el motivo con
 *   `customRangeError` y no dispara la petición.
 *
 * Ya no hay «desde el inicio»: arrancaba en el alta del negocio y podía llegar a
 * 366 días, que es justo la consulta que este endpoint no debe permitir. Por eso
 * tampoco necesita ya el `created_at` del negocio.
 */
export function reportWindow(period: ReportPeriod, custom?: CustomRange): ReportWindow {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "custom" && custom && !customRangeError(custom.from, custom.to)) {
    const [fy, fm, fd] = custom.from.split("-").map(Number);
    const [ty, tm, td] = custom.to.split("-").map(Number);
    const days =
      Math.round(
        (new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()) /
          86_400_000,
      ) + 1;
    return { date_from: custom.from, date_to: custom.to, days };
  }
  const span = period === "custom" ? MAX_RANGE_DAYS : Number(period);
  const start = new Date(end);
  start.setDate(start.getDate() - (span - 1));
  return { date_from: ymdLocal(start), date_to: ymdLocal(end), days: span };
}

/** «En tus N días con yitopro»: días locales desde el alta hasta hoy, mínimo 1. */
export function daysSinceSignup(createdAt: string): number {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = localDayStart(createdAt);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

/**
 * Resumen de valor de la ventana. 403 si la sesión no es del dueño.
 *
 * `professionalId` acota SOLO el bloque de agenda (el backend no tiene
 * profesional en cobros ni en conversaciones). Un id de otro tenant no matchea
 * nada y devuelve rankings vacíos, no un error.
 */
export async function getValueSummary(
  range: ReportWindow,
  professionalId?: number,
): Promise<ValueSummary> {
  const raw = await api.get<BackendValueSummary>("/reports/value-summary/", {
    query: {
      date_from: range.date_from,
      date_to: range.date_to,
      ...(professionalId !== undefined ? { professional_id: professionalId } : {}),
    },
  });
  return fromBackend(raw);
}

/**
 * El CSV de cobros de la ventana, como TEXTO. `parseBody` del cliente devuelve
 * el cuerpo tal cual cuando el Content-Type no es JSON; el componente que
 * descarga lo envuelve en un Blob — ningún componente habla con la red.
 */
export function exportValueCsv(window: ReportWindow): Promise<string> {
  return api.get<string>("/reports/export.csv", {
    query: { date_from: window.date_from, date_to: window.date_to },
  });
}
