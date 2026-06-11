import type { Customer } from "@/lib/types";

import { api } from "./client";

export function listCustomers(): Promise<Customer[]> {
  return api.get<Customer[]>("/customers");
}

export function getCustomer(id: string): Promise<Customer> {
  return api.get<Customer>(`/customers/${id}`);
}

export type CreateCustomerInput = Pick<Customer, "name" | "phone">;

export function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  return api.post<Customer>("/customers", input);
}
