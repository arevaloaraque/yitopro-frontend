import type { Product } from "@/lib/types";

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

export async function listProducts(): Promise<Product[]> {
  const res = await api.get<BackendProduct[]>("/products/");
  return res.map(fromBackend);
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
