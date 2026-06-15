import type { Appointment } from "@/lib/types";

export interface EnrichedAppointment extends Appointment {
  customerName: string;
  serviceName: string;
}
