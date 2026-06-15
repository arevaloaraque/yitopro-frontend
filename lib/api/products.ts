import type { Paginated, Product } from "@/lib/types";

import { api } from "./client";

export async function listProducts(): Promise<Product[]> {
  const res = await api.get<Paginated<Product>>("/products");
  return res.items;
}

export type CreateProductInput = Omit<Product, "id" | "business_id">;

export function createProduct(input: CreateProductInput): Promise<Product> {
  return api.post<Product>("/products", input);
}

export function updateProduct(
  id: string,
  patch: Partial<Omit<Product, "id" | "business_id">>,
): Promise<Product> {
  return api.patch<Product>(`/products/${id}`, patch);
}
