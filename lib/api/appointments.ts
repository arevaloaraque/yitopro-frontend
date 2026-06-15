import type { Appointment, AppointmentAuditEntry, Paginated } from "@/lib/types";

import { api } from "./client";

export interface ListAppointmentsParams {
  /** Filtra por estado. */
  status?: Appointment["status"];
  /** Rango (ISO 8601) — citas con `start` dentro del rango. */
  from?: string;
  to?: string;
  customer_id?: string;
}

export async function listAppointments(
  params: ListAppointmentsParams = {},
): Promise<Appointment[]> {
  const res = await api.get<Paginated<Appointment>>("/appointments", {
    query: { ...params },
  });
  return res.items;
}

export interface CreateAppointmentInput {
  service_id: string;
  customer_id: string;
  start: string;
  end: string;
  notes?: string | null;
}

export function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  return api.post<Appointment>("/appointments", input);
}

export function cancelAppointment(id: string, reason?: string): Promise<Appointment> {
  return api.post<Appointment>(`/appointments/${id}/cancel`, {
    reason: reason ?? null,
  });
}

export function rescheduleAppointment(
  id: string,
  next: { start: string; end: string },
): Promise<Appointment> {
  return api.post<Appointment>(`/appointments/${id}/reschedule`, next);
}

export async function getAppointmentHistory(
  id: string,
): Promise<AppointmentAuditEntry[]> {
  const res = await api.get<Paginated<AppointmentAuditEntry>>(
    `/appointments/${id}/history`,
  );
  return res.items;
}
