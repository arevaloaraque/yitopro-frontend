/** Professional (staff member) who delivers services. Mirrors the backend `ProfessionalOut` schema. */
export interface Professional {
  id: string;
  name: string;
  is_active: boolean;
}

/** A single availability window for a professional's weekly schedule. */
export interface ScheduleWindow {
  day_of_week: number; // 0=Mon … 6=Sun
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
}
