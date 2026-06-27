/** Servicio que el negocio ofrece y agenda. Reflejo del schema `Service`. */
export interface Service {
  id: string;
  /** No expuesto por el backend (scope por tenant); presente solo en mocks. */
  business_id?: string;
  name: string;
  duration_minutes: number;
  /** Precio en la unidad menor de la moneda del negocio (entero). */
  price: number;
  is_active: boolean;
}
