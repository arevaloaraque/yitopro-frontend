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
  customer_name: string;
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
    professional_id: String(a.professional_id),
    customer_id: String(a.customer_id),
    customer_name: a.customer_name,
    start: a.start_datetime,
    end: a.end_datetime,
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
  /** Filter by assigned professional / service (server-side). */
  professional_id?: string;
  service_id?: string;
}

export async function listAppointments(
  params: ListAppointmentsParams = {},
): Promise<Appointment[]> {
  // The backend filters by `date` (a single day, mapped from `from`), `status`,
  // `professional_id` and `service_id`. `to`/`customer_id` have no equivalent
  // and are omitted.
  const query: Record<string, string> = {};
  if (params.from) query.date = params.from.slice(0, 10);
  if (params.status) query.status = params.status;
  if (params.professional_id) query.professional_id = params.professional_id;
  if (params.service_id) query.service_id = params.service_id;
  const res = await api.get<BackendAppointment[]>("/appointments/", { query });
  return res.map(fromBackend);
}

export interface CreateAppointmentInput {
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

export async function getAppointmentHistory(
  _id: string,
): Promise<AppointmentAuditEntry[]> {
  // The backend does not yet expose appointment audit history (no endpoint
  // nor model). We return empty until it exists; see README (F4-B).
  return [];
}
