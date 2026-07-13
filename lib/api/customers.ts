import type { Customer, Note, Paginated } from "@/lib/types";

import { api, apiFetchWithStatus } from "./client";

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
    email: c.email ?? "",
    created_at: c.created_at,
  };
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

export interface CreateCustomerInput {
  name: string;
  phone: string;
  email?: string;
}

/**
 * Creates a customer, or returns the existing one for that phone (backend is
 * get-or-create). `created` distinguishes 201 (new) from 200 (existing) so
 * callers can warn the operator instead of silently discarding the typed
 * name/email when a duplicate phone matched an existing record.
 */
export async function createCustomer(
  input: CreateCustomerInput,
): Promise<{ customer: Customer; created: boolean }> {
  const body: Record<string, unknown> = {
    phone: input.phone,
    display_name: input.name,
  };
  if (input.email) body.email = input.email;
  const { status, body: raw } = await apiFetchWithStatus<BackendCustomer>(
    "/customers/",
    { method: "POST", body },
  );
  return { customer: fromBackend(raw), created: status === 201 };
}

/**
 * Updates an existing customer. The backend only allows editing `display_name`
 * and `email` (the phone is immutable — it's the customer's identity).
 */
export function updateCustomer(
  id: string,
  patch: { name?: string; email?: string },
): Promise<Customer> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.display_name = patch.name;
  if (patch.email !== undefined) body.email = patch.email;
  return api.patch<BackendCustomer>(`/customers/${id}/`, body).then(fromBackend);
}

interface BackendNote {
  id: number;
  body: string;
  author_name: string;
  created_at: string;
}

function noteFromBackend(n: BackendNote): Note {
  return {
    id: String(n.id),
    body: n.body,
    author_name: n.author_name,
    created_at: n.created_at,
  };
}

/** A customer's notes (the staff log about them), newest first. */
export async function getCustomerNotes(customerId: string): Promise<Note[]> {
  const res = await api.get<BackendNote[]>(`/customers/${customerId}/notes/`);
  return res.map(noteFromBackend);
}

/** Adds a note about the customer; returns the created note. */
export async function addCustomerNote(customerId: string, body: string): Promise<Note> {
  return noteFromBackend(
    await api.post<BackendNote>(`/customers/${customerId}/notes/`, { body }),
  );
}
