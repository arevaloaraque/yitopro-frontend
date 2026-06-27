import type { Appointment, AppointmentAuditEntry } from "@/lib/types";

import { api } from "./client";

/**
 * Shape real del backend (Django Ninja `AppointmentOut`). Diferencias con la
 * UI: `start_datetime`/`end_datetime` (la UI usa `start`/`end`), `origin`
 * (admin|ai|human) en vez de `created_by` (ai|human), `id`s enteros. El mapeo
 * vive aquí; los componentes consumen `Appointment` sin cambios.
 */
interface BackendAppointment {
  id: number;
  service_id: number;
  professional_id: number;
  customer_id: number;
  start_datetime: string;
  end_datetime: string;
  status: string;
  origin: string;
  notes: string;
  cancellation_reason: string;
}

function fromBackend(a: BackendAppointment): Appointment {
  return {
    id: String(a.id),
    service_id: String(a.service_id),
    customer_id: String(a.customer_id),
    start: a.start_datetime,
    end: a.end_datetime,
    // El backend no tiene estado "rescheduled"; puede devolver "no_show".
    status: a.status as Appointment["status"],
    // El panel (admin) cuenta como humano frente a la IA.
    created_by: a.origin === "ai" ? "ai" : "human",
    notes: a.notes || null,
  };
}

export interface ListAppointmentsParams {
  status?: Appointment["status"];
  /** Rango (ISO 8601) — el backend solo filtra por fecha; se usa el día de `from`. */
  from?: string;
  to?: string;
  customer_id?: string;
}

export async function listAppointments(
  params: ListAppointmentsParams = {},
): Promise<Appointment[]> {
  // El backend solo expone un filtro `date` (un día). Mapeamos el día de
  // `from`; `to`/`customer_id` no tienen equivalente y se omiten (la agenda
  // pide sin filtros y filtra en cliente; el dashboard pide el día de hoy).
  const query: Record<string, string> = {};
  if (params.from) query.date = params.from.slice(0, 10);
  if (params.status) query.status = params.status;
  const res = await api.get<BackendAppointment[]>("/appointments/", { query });
  return res.map(fromBackend);
}

export interface CreateAppointmentInput {
  service_id: string;
  customer_id: string;
  start: string;
  end: string;
  notes?: string | null;
}

export function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  // El backend calcula `end` desde la duración del servicio; solo enviamos el
  // inicio. `origin` por defecto = admin (creada desde el panel).
  return api
    .post<BackendAppointment>("/appointments/", {
      service_id: Number(input.service_id),
      customer_id: Number(input.customer_id),
      start_datetime: input.start,
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
  // El backend reagenda solo por inicio (recalcula el fin); `next.end` se ignora.
  return api
    .patch<BackendAppointment>(`/appointments/${id}/reschedule/`, {
      new_start_datetime: next.start,
    })
    .then(fromBackend);
}

export async function getAppointmentHistory(
  _id: string,
): Promise<AppointmentAuditEntry[]> {
  // El backend aún no expone historial de auditoría de citas (no hay endpoint
  // ni modelo). Devolvemos vacío hasta que exista; ver README (F4-B).
  return [];
}
