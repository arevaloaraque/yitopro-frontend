import type { Paginated, Product, ProductCategory } from "@/lib/types";

import { api } from "./client";

/**
 * Actual backend shape (Django Ninja `ProductOut`). Renames relative to the
 * UI: `active`→`is_active`, `whatsapp_enabled`→`sellable_via_whatsapp`; integer
 * `id`, `price` as a Decimal-string. The mapping lives here; components consume
 * `Product` unchanged.
 */
interface BackendProduct {
  id: number;
  name: string;
  description: string;
  price: string;
  stock: number;
  active: boolean;
  whatsapp_enabled: boolean;
  category_id: number | null;
  /** Resuelto por el servidor; `null` en un producto sin categoría. */
  category_name?: string | null;
}

interface Page {
  items: BackendProduct[];
  count: number;
}

function fromBackend(p: BackendProduct): Product {
  return {
    id: String(p.id),
    name: p.name,
    description: p.description,
    price: Number(p.price),
    stock: p.stock,
    sellable_via_whatsapp: p.whatsapp_enabled,
    is_active: p.active,
    category_name: p.category_name ?? null,
  };
}

/**
 * Categorías del catálogo: lista PLANA, sin `{items, count}`. Son unas pocas por
 * negocio, así que el backend no las pagina y aquí no hay bucle que recorrer.
 * Solo se convierte el `id` a texto, igual que en `fromBackend`.
 */
export async function listProductCategories(): Promise<ProductCategory[]> {
  const res = await api.get<{ id: number; name: string }[]>("/products/categories/");
  return res.map((c) => ({ id: String(c.id), name: c.name }));
}

interface ProductSearchParams {
  search?: string;
  limit?: number;
  offset?: number;
  active?: boolean;
  /**
   * Texto y no número: el valor sale del `<Select>` de categoría y de la URL, que
   * son texto, y el query string vuelve a serializarlo a texto. Convertirlo a
   * `number` en medio solo añadiría un camino con `NaN` (`Number("abc")`) que
   * viajaría como `category_id=NaN`.
   */
  category_id?: string;
  /**
   * Tope INCLUSIVO de stock: `stock_lte=0` devuelve solo los agotados. Texto por
   * el mismo motivo que `category_id` — y ojo: el "0" no se puede perder por el
   * camino, que es justo el filtro más útil de los tres.
   */
  stock_lte?: string;
}

/** Server-side search/pagination (Products table). */
export async function searchProducts(
  params: ProductSearchParams = {},
): Promise<Paginated<Product>> {
  const res = await api.get<Page>("/products/", {
    query: {
      search: params.search,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      active: params.active,
      category_id: params.category_id,
      stock_lte: params.stock_lte,
    },
  });
  return { items: res.items.map(fromBackend), count: res.count };
}

type CreateProductInput = Omit<Product, "id" | "business_id">;

export function createProduct(input: CreateProductInput): Promise<Product> {
  return api
    .post<BackendProduct>("/products/", {
      name: input.name,
      // `?? ""` y no omitir: es el texto que el agente lee para vender, y el
      // producto nacía sin él porque este mapeo nunca lo enviaba.
      description: input.description ?? "",
      price: input.price,
      stock: input.stock,
      whatsapp_enabled: input.sellable_via_whatsapp,
      active: input.is_active,
    })
    .then(fromBackend);
}

export function updateProduct(
  id: string,
  patch: Partial<Omit<Product, "id" | "business_id">>,
): Promise<Product> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.price !== undefined) body.price = patch.price;
  if (patch.stock !== undefined) body.stock = patch.stock;
  if (patch.sellable_via_whatsapp !== undefined)
    body.whatsapp_enabled = patch.sellable_via_whatsapp;
  if (patch.is_active !== undefined) body.active = patch.is_active;
  return api.patch<BackendProduct>(`/products/${id}/`, body).then(fromBackend);
}
