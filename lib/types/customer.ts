/** Business customer. Mirror of the `Customer` schema. */
export interface Customer {
  id: string;
  /** Not exposed by the backend (scoped per tenant); present only in mocks. */
  business_id?: string;
  name: string;
  /** Phone number in E.164 format (e.g. "+56912345678"). Set at creation, immutable after. */
  phone: string;
  /** Contact email (may be empty). */
  email: string;
  /** ISO 8601. */
  created_at: string;
  /**
   * Average rating of THIS CUSTOMER'S BEHAVIOUR (1-5), computed by the conversation
   * evaluator over their closed threads. `null` while `rating_count === 0`.
   *
   * Careful with the direction: it is a rating OF the customer, not the customer's rating
   * of the business. Any label must say so or it reads inverted.
   */
  rating_avg: number | null;
  /** How many closed conversations have been rated. 0 ⇒ show "Sin calificar", never 0/5. */
  rating_count: number;
}
