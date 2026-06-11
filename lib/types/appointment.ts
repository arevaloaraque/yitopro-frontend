import type { ActorType } from "./common";

/** Estado de una cita. */
export type AppointmentStatus = "scheduled" | "cancelled" | "rescheduled" | "completed";

/** Cita agendada. Reflejo del schema `Appointment`. */
export interface Appointment {
  id: string;
  business_id: string;
  service_id: string;
  customer_id: string;
  /** Inicio en ISO 8601. */
  start: string;
  /** Fin en ISO 8601. */
  end: string;
  status: AppointmentStatus;
  /** Quién creó la cita: la IA o un humano. */
  created_by: ActorType;
  notes: string | null;
}
