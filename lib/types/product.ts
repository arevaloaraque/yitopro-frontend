/** Sellable product. Mirrors the `Product` schema. */
export interface Product {
  id: string;
  /** Not exposed by the backend (scoped per tenant); present only in mocks. */
  business_id?: string;
  name: string;
  /** Price in the business currency's major unit, up to 2 decimals (backend serializes it as a Decimal string, e.g. "8990.00"). */
  price: number;
  stock: number;
  sellable_via_whatsapp: boolean;
  is_active: boolean;
}
