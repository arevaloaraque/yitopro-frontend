import type { Product } from "@/lib/types";

import { api } from "./client";

export function listProducts(): Promise<Product[]> {
  return api.get<Product[]>("/products");
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
