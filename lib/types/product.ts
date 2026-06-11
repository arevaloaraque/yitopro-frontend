/** Producto vendible. Reflejo del schema `Product`. */
export interface Product {
  id: string;
  business_id: string;
  name: string;
  /** Precio en la unidad menor de la moneda del negocio (entero). */
  price: number;
  stock: number;
  sellable_via_whatsapp: boolean;
  is_active: boolean;
}
