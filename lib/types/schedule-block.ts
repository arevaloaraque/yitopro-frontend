/**
 * A manual time block that removes availability (vacation, closure, errand).
 * Mirrors the backend `ScheduleBlockOut`.
 */
export interface ScheduleBlock {
  id: string;
  /** null = the whole business is blocked; otherwise the professional's id. */
  professional_id: string | null;
  /** Professional's name, or "" when the block is business-wide. */
  professional_name: string;
  /** ISO 8601 datetime. */
  start_datetime: string;
  /** ISO 8601 datetime. */
  end_datetime: string;
  reason: string;
}
