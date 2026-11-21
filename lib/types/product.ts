/** Sellable product. Mirrors the `Product` schema. */
export interface Product {
  id: string;
  /** Not exposed by the backend (scoped per tenant); present only in mocks. */
  business_id?: string;
  name: string;
  /**
   * Texto libre que el agente de WhatsApp lee para vender: la búsqueda de
   * catálogo del agente corre sobre `name` Y `description`, así que un producto
   * sin ella solo se encuentra por el nombre exacto. Opcional en el tipo (el
   * backend la manda siempre, aunque sea ""), igual que en `Service`.
   */
  description?: string;
  /** Price in the business currency's major unit, up to 2 decimals (backend serializes it as a Decimal string, e.g. "8990.00"). */
  price: number;
  stock: number;
  sellable_via_whatsapp: boolean;
  is_active: boolean;
  /**
   * Nombre de la categoría, resuelto por el servidor (`null` en un producto sin
   * categorizar). Viaja el NOMBRE y no solo el `category_id` justamente para que
   * la tabla no tenga que cruzar el id contra la lista de categorías fila por
   * fila —y para que siga mostrando algo si esa lista aún no llegó—.
   */
  category_name?: string | null;
}

/**
 * Categoría del catálogo. `id` es texto igual que en `Product`: el único sitio
 * donde este valor se usa es un `<Select>` y la URL, y los dos son texto.
 */
export interface ProductCategory {
  id: string;
  name: string;
}
