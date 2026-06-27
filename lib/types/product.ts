/** Producto vendible. Reflejo del schema `Product`. */
export interface Product {
  id: string;
  /** No expuesto por el backend (scope por tenant); presente solo en mocks. */
  business_id?: string;
  name: string;
  /** Precio en la unidad menor de la moneda del negocio (entero). */
  price: number;
  stock: number;
  sellable_via_whatsapp: boolean;
  is_active: boolean;
}
