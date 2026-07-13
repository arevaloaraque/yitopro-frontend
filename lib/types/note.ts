/** A free-text note a staff member registers about a customer (per service/consultation). */
export interface Note {
  id: string;
  /** The note text. */
  body: string;
  /** Who wrote it (staff email, or "" if unknown). */
  author_name: string;
  /** ISO 8601. */
  created_at: string;
}
