import type { Customer, Paginated } from "@/lib/types";

import { api } from "./client";

export async function listCustomers(): Promise<Customer[]> {
  const res = await api.get<Paginated<Customer>>("/customers");
  return res.items;
}

export function getCustomer(id: string): Promise<Customer> {
  return api.get<Customer>(`/customers/${id}`);
}

export type CreateCustomerInput = Pick<Customer, "name" | "phone">;

export function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  return api.post<Customer>("/customers", input);
}
