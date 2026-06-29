import type { Appointment, AppointmentAuditEntry } from "@/lib/types";

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
    // The backend has no "rescheduled" status; it may return "no_show".
    status: a.status as Appointment["status"],
    // The admin panel counts as human as opposed to the AI.
    created_by: a.origin === "ai" ? "ai" : "human",
    notes: a.notes || null,
  };
}

export interface ListAppointmentsParams {
  status?: Appointment["status"];
  /** Range (ISO 8601) — the backend only filters by date; the day of `from` is used. */
  from?: string;
  to?: string;
  customer_id?: string;
}

export async function listAppointments(
  params: ListAppointmentsParams = {},
): Promise<Appointment[]> {
  // The backend only exposes a `date` filter (a single day). We map the day of
  // `from`; `to`/`customer_id` have no equivalent and are omitted (the schedule
  // requests without filters and filters client-side; the dashboard requests today).
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
  // The backend computes `end` from the service duration; we only send the
  // start. `origin` defaults to admin (created from the panel).
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
  // The backend reschedules by start only (recomputes the end); `next.end` is ignored.
  return api
    .patch<BackendAppointment>(`/appointments/${id}/reschedule/`, {
      new_start_datetime: next.start,
    })
    .then(fromBackend);
}

export async function getAppointmentHistory(
  _id: string,
): Promise<AppointmentAuditEntry[]> {
  // The backend does not yet expose appointment audit history (no endpoint
  // nor model). We return empty until it exists; see README (F4-B).
  return [];
}
