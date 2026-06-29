/** Business customer. Mirror of the `Customer` schema. */
export interface Customer {
  id: string;
  /** Not exposed by the backend (scoped per tenant); present only in mocks. */
  business_id?: string;
  name: string;
  /** Phone number in E.164 format (e.g. "+56912345678"). */
  phone: string;
  /** ISO 8601. */
  created_at: string;
}
