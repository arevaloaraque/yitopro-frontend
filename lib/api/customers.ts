import type { Customer, Paginated } from "@/lib/types";

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
 * Todos los clientes — para los mapas id→nombre (appointments/conversations/
 * dashboard) que necesitan resolver cualquier id de la página.
 * ponytail: tope de 1000; si un negocio supera eso, incrustar el nombre del
 * cliente en esos payloads en vez de traerlos todos aquí.
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

/** Búsqueda/paginación server-side (combobox de cliente y tabla de Clientes). */
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
