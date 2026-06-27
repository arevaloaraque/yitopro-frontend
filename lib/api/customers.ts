import type { Customer } from "@/lib/types";

import { api } from "./client";

/**
 * Shape real del backend (Django Ninja `CustomerOut`). Renombre: backend usa
 * `display_name`, la UI usa `name`; `id` entero; expone `email` (la UI no lo
 * usa). El mapeo vive aquí; los componentes consumen `Customer` sin cambios.
 */
interface BackendCustomer {
  id: number;
  phone: string;
  display_name: string;
  email: string;
  created_at: string;
}

function fromBackend(c: BackendCustomer): Customer {
  return {
    id: String(c.id),
    name: c.display_name,
    phone: c.phone,
    created_at: c.created_at,
  };
}

export async function listCustomers(): Promise<Customer[]> {
  const res = await api.get<BackendCustomer[]>("/customers/");
  return res.map(fromBackend);
}

export function getCustomer(id: string): Promise<Customer> {
  return api.get<BackendCustomer>(`/customers/${id}/`).then(fromBackend);
}

export type CreateCustomerInput = Pick<Customer, "name" | "phone">;

export function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  return api
    .post<BackendCustomer>("/customers/", {
      phone: input.phone,
      display_name: input.name,
    })
    .then(fromBackend);
}
