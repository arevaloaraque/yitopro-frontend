import type { Paginated, Product } from "@/lib/types";

import { api } from "./client";

/**
 * Shape real del backend (Django Ninja `ProductOut`). Renombres respecto a la
 * UI: `active`→`is_active`, `whatsapp_enabled`→`sellable_via_whatsapp`; `id`
 * entero, `price` Decimal-string. El mapeo vive aquí; los componentes
 * consumen `Product` sin cambios.
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
}

interface Page {
  items: BackendProduct[];
  count: number;
}

function fromBackend(p: BackendProduct): Product {
  return {
    id: String(p.id),
    name: p.name,
    price: Number(p.price),
    stock: p.stock,
    sellable_via_whatsapp: p.whatsapp_enabled,
    is_active: p.active,
  };
}

/**
 * Todos los productos (para consumidores que esperan la lista completa).
 * ponytail: tope de 1000; la tabla de Productos usa `searchProducts` paginado.
 */
export async function listProducts(): Promise<Product[]> {
  const res = await api.get<Page>("/products/", { query: { limit: 1000 } });
  return res.items.map(fromBackend);
}

export interface ProductSearchParams {
  search?: string;
  limit?: number;
  offset?: number;
  active?: boolean;
  category_id?: number;
}

/** Búsqueda/paginación server-side (tabla de Productos). */
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
    },
  });
  return { items: res.items.map(fromBackend), count: res.count };
}

export type CreateProductInput = Omit<Product, "id" | "business_id">;

export function createProduct(input: CreateProductInput): Promise<Product> {
  return api
    .post<BackendProduct>("/products/", {
      name: input.name,
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
  if (patch.price !== undefined) body.price = patch.price;
  if (patch.stock !== undefined) body.stock = patch.stock;
  if (patch.sellable_via_whatsapp !== undefined)
    body.whatsapp_enabled = patch.sellable_via_whatsapp;
  if (patch.is_active !== undefined) body.active = patch.is_active;
  return api.patch<BackendProduct>(`/products/${id}/`, body).then(fromBackend);
}
