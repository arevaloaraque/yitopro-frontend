import type { ActorType } from "./common";

/** Status of an appointment. */
export type AppointmentStatus = "scheduled" | "cancelled" | "completed" | "no_show";

/** Scheduled appointment. Mirror of the `Appointment` schema. */
export interface Appointment {
  id: string;
  /** Not exposed by the backend (scoped per tenant); present only in mocks. */
  business_id?: string;
  service_id: string;
  /** Professional assigned to the appointment. */
  professional_id: string;
  customer_id: string;
  /** Resolved by the backend (display_name or phone). */
  customer_name: string;
  /** Start time in ISO 8601. */
  start: string;
  /** End time in ISO 8601. */
  end: string;
  status: AppointmentStatus;
  /** Who created the appointment: the AI or a human. */
  created_by: ActorType;
  notes: string | null;
}

/** Event in an appointment's change history. */
export interface AppointmentAuditEntry {
  id: string;
  appointment_id: string;
  event: "created" | "cancelled" | "rescheduled" | "completed" | "no_show";
  /** ISO 8601. */
  timestamp: string;
  details: string | null;
}
