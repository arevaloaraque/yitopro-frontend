/** Cliente del negocio. Reflejo del schema `Customer`. */
export interface Customer {
  id: string;
  business_id: string;
  name: string;
  /** Teléfono en formato E.164 (p.ej. "+56912345678"). */
  phone: string;
  /** ISO 8601. */
  created_at: string;
}
