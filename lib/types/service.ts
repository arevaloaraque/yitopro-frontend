/** Service the business offers and schedules. Mirrors the `Service` schema. */
export interface Service {
  id: string;
  /** Not exposed by the backend (scoped per tenant); present only in mocks. */
  business_id?: string;
  name: string;
  duration_minutes: number;
  /** Price in the business currency's minor unit (integer). */
  price: number;
  is_active: boolean;
}
