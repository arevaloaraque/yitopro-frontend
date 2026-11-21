import type { Appointment, AppointmentAuditEntry, Paginated } from "@/lib/types";

import { api } from "./client";

/**
 * Actual backend shape (Django Ninja `AppointmentOut`). Differences from the
 * UI: `start_datetime`/`end_datetime` (the UI uses `start`/`end`), `origin`
 * (admin|ai|human) instead of `created_by` (ai|human), integer `id`s. The
 * mapping lives here; components consume `Appointment` unchanged.
 */
interface BackendAppointment {
  id: number;
  service_id: number;
  professional_id: number;
  customer_id: number;
  customer_name: string;
  start_datetime: string;
  end_datetime: string;
  status: string;
  origin: string;
  notes: string;
  cancellation_reason: string;
  service_name: string;
  service_price: string;
}

function fromBackend(a: BackendAppointment): Appointment {
  return {
    id: String(a.id),
    service_id: String(a.service_id),
    professional_id: String(a.professional_id),
    customer_id: String(a.customer_id),
    customer_name: a.customer_name,
    start: a.start_datetime,
    end: a.end_datetime,
    status: a.status as Appointment["status"],
    // The admin panel counts as human as opposed to the AI.
    created_by: a.origin === "ai" ? "ai" : "human",
    notes: a.notes || null,
    service_name: a.service_name,
    // Backend Decimal string → number, like every other money field.
    service_price: a.service_price === undefined ? undefined : Number(a.service_price),
  };
}

/** El sobre paginado del backend (`@paginate`): `{items, count}`, NO un array. */
interface Page {
  items: BackendAppointment[];
  count: number;
}

export interface ListAppointmentsParams {
  status?: Appointment["status"];
  /**
   * Un día suelto de calendario (`YYYY-MM-DD`) en la zona horaria del NEGOCIO.
   * El backend le da PRIORIDAD sobre el rango, así que esta función manda uno o
   * el otro, nunca los dos: pedir «hoy» junto a una semana devolvía el día
   * suelto y el panel dibujaba la semana con los datos de una sola jornada.
   */
  date?: string;
  /**
   * Rango de días de calendario INCLUSIVO (`YYYY-MM-DD`), también en la zona
   * horaria del negocio. El backend rechaza rangos de más de 366 días.
   */
  date_from?: string;
  date_to?: string;
  customer_id?: string;
  /** Filter by assigned professional / service (server-side). */
  professional_id?: string;
  service_id?: string;
  limit?: number;
  offset?: number;
  /**
   * Orden del SERVIDOR, conjunto cerrado. Existe para la vista Lista: con el
   * ascendente por defecto, mostrar «lo último primero» obligaba a invertir cada
   * página en el navegador, y entonces «Cargar más» insertaba citas más nuevas
   * ENCIMA de las que ya estaban y movía la fila que se estaba leyendo. El orden
   * tiene que venir del servidor o no es compatible con paginar.
   */
  ordering?: "start_datetime" | "-start_datetime" | "created_at" | "-created_at";
}

/**
 * Citas del negocio. Devuelve el sobre paginado `{items, count}` tal cual, con
 * `limit`/`offset` reales.
 *
 * `limit` va EXPLÍCITO porque el default del servidor es 100: callarlo trunca en
 * silencio, y una agenda cortada se lee como completa — que es peor que un
 * error, porque nadie va a buscar la cita que falta. Quien llama decide cuánto
 * puede mostrar y compara `items.length` con `count` para saber si se quedó
 * corto.
 */
export async function listAppointments(
  params: ListAppointmentsParams = {},
): Promise<Paginated<Appointment>> {
  const res = await api.get<Page>("/appointments/", {
    query: {
      // `date` gana en el servidor; mandar los dos deja a la UI diciendo una
      // ventana y al backend contestando otra.
      ...(params.date
        ? { date: params.date }
        : { date_from: params.date_from, date_to: params.date_to }),
      status: params.status,
      professional_id: params.professional_id,
      service_id: params.service_id,
      customer_id: params.customer_id,
      // Se omite cuando no se pide: el default del servidor es `start_datetime` y
      // mandarlo explícitamente solo ensucia la URL de la petición.
      ordering: params.ordering,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    },
  });
  return { items: res.items.map(fromBackend), count: res.count };
}

interface CreateAppointmentInput {
  service_id: string;
  customer_id: string;
  start: string;
  end: string;
  /** Optional preferred professional; the backend auto-assigns when omitted. */
  professional_id?: string;
  notes?: string | null;
}

export function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  // The backend computes `end` from the service duration; we only send the
  // start. `origin` defaults to admin (created from the panel). When
  // `professional_id` is omitted the backend picks the first available one.
  return api
    .post<BackendAppointment>("/appointments/", {
      service_id: Number(input.service_id),
      customer_id: Number(input.customer_id),
      start_datetime: input.start,
      professional_id: input.professional_id
        ? Number(input.professional_id)
        : undefined,
      notes: input.notes ?? "",
    })
    .then(fromBackend);
}

export function cancelAppointment(id: string, reason?: string): Promise<Appointment> {
  return api
    .patch<BackendAppointment>(`/appointments/${id}/cancel/`, {
      reason: reason ?? "",
    })
    .then(fromBackend);
}

export function rescheduleAppointment(
  id: string,
  next: { start: string; end: string },
): Promise<Appointment> {
  // The backend reschedules by start only (recomputes the end); `next.end` is ignored.
  return api
    .patch<BackendAppointment>(`/appointments/${id}/reschedule/`, {
      new_start_datetime: next.start,
    })
    .then(fromBackend);
}

/** Backend `HistoryEventOut` — a chronological lifecycle event. */
interface BackendHistoryEvent {
  event_type: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

/** `event_type` (backend) → the UI's audit `event`. */
const HISTORY_EVENT_MAP: Record<string, AppointmentAuditEntry["event"]> = {
  appointment_created: "created",
  appointment_cancelled: "cancelled",
  appointment_rescheduled: "rescheduled",
  appointment_completed: "completed",
  appointment_no_show: "no_show",
};

/**
 * Chronological lifecycle history of an appointment (`GET /{id}/history/`).
 * The backend returns `{event_type, created_at, metadata}` ordered by time;
 * we map it to the UI's `AppointmentAuditEntry`. `metadata`'s shape isn't part
 * of the agreed display contract, so `details` stays null (the dialog omits it).
 * Unknown event types are dropped so a future backend event can't crash the UI.
 */
export async function getAppointmentHistory(
  id: string,
): Promise<AppointmentAuditEntry[]> {
  const res = await api.get<BackendHistoryEvent[]>(`/appointments/${id}/history/`);
  return res
    .map((e, i): AppointmentAuditEntry | null => {
      const event = HISTORY_EVENT_MAP[e.event_type];
      if (!event) return null;
      return {
        id: `${id}-${i}`,
        appointment_id: id,
        event,
        timestamp: e.created_at,
        details: null,
      };
    })
    .filter((e): e is AppointmentAuditEntry => e !== null);
}
