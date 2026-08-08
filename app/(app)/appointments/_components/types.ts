import type { Appointment } from "@/lib/types";

export interface EnrichedAppointment extends Appointment {
  customerName: string;
  serviceName: string;
  professionalName: string;
}

/**
 * A appointment is untouchable once it STARTS, not once it ends: rescheduling
 * or cancelling with the service already underway is a retroactive change,
 * which is exactly what the agenda must not allow. Reading — detail popover,
 * history — stays open for every appointment, past or not.
 */
export function isPastAppointment(a: { start: string }): boolean {
  return new Date(a.start).getTime() <= Date.now();
}
