/** Cliente del negocio. Reflejo del schema `Customer`. */
export interface Customer {
  id: string;
  /** No expuesto por el backend (scope por tenant); presente solo en mocks. */
  business_id?: string;
  name: string;
  /** Teléfono en formato E.164 (p.ej. "+56912345678"). */
  phone: string;
  /** ISO 8601. */
  created_at: string;
}
