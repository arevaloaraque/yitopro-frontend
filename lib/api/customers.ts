import type { Customer, Paginated } from "@/lib/types";

import { api } from "./client";

/**
 * Actual backend shape (Django Ninja `CustomerOut`). Renaming: the backend uses
 * `display_name`, the UI uses `name`; integer `id`; exposes `email` (the UI does
 * not use it). The mapping lives here; components consume `Customer` unchanged.
 */
interface BackendCustomer {
  id: number;
  phone: string;
  display_name: string;
  email: string;
  created_at: string;
}

interface Page {
  items: BackendCustomer[];
  count: number;
}

function fromBackend(c: BackendCustomer): Customer {
  return {
    id: String(c.id),
    name: c.display_name,
    phone: c.phone,
    created_at: c.created_at,
  };
}

/**
 * All customers — for the id→name maps (appointments/conversations/dashboard)
 * that need to resolve any id on the page.
 * ponytail: cap of 1000; if a business exceeds that, embed the customer name in
 * those payloads instead of fetching them all here.
 */
export async function listCustomers(): Promise<Customer[]> {
  const res = await api.get<Page>("/customers/", { query: { limit: 1000 } });
  return res.items.map(fromBackend);
}

export interface CustomerSearchParams {
  search?: string;
  limit?: number;
  offset?: number;
}

/** Server-side search/pagination (customer combobox and Customers table). */
export async function searchCustomers(
  params: CustomerSearchParams = {},
): Promise<Paginated<Customer>> {
  const res = await api.get<Page>("/customers/", {
    query: {
      search: params.search,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
    },
  });
  return { items: res.items.map(fromBackend), count: res.count };
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
