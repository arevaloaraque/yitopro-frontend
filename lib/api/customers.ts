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
  rating_avg: number | null;
  rating_count: number;
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
    // `?? null` / `?? 0`: the fields landed later than the rest of the schema, so a stale
    // cached response (or a mock) without them must read as "not rated", never as 0/5.
    rating_avg: c.rating_avg ?? null,
    rating_count: c.rating_count ?? 0,
  };
}

/**
 * El orden que sabe servir el backend, enum CERRADO: un valor que no esté en
 * esta lista responde **422**, así que lo que llegue por la URL se sanea contra
 * ella en vez de reenviarse a ciegas (un `?sort=lol` escrito a mano dejaría la
 * pantalla en estado de error).
 *
 * Orden de la lista = orden del desplegable, no del enum del backend: el default
 * va primero.
 */
export const CUSTOMER_ORDERINGS = [
  "-created_at",
  "created_at",
  "display_name",
  "-display_name",
  "-rating_avg",
  "rating_avg",
] as const;

export type CustomerOrdering = (typeof CUSTOMER_ORDERINGS)[number];

/** El mismo default que aplica el backend si no se manda `ordering`. */
export const DEFAULT_CUSTOMER_ORDERING: CustomerOrdering = "-created_at";

/**
 * Día de calendario (`YYYY-MM-DD`, lo que produce un `<input type="date">`) →
 * instante ISO, desplazado `plusDays`.
 *
 * Tres cosas que este helper existe para no repetir en la pantalla:
 *
 * 1. **Medianoche LOCAL, no UTC.** `new Date("2026-08-08")` a secas es
 *    medianoche UTC; en Chile eso es el 7 a las 20:00, así que «desde el 8»
 *    arrastraba clientes del día anterior. La `T00:00:00` sin zona es lo que
 *    fuerza la lectura local. Mismo criterio que la ventana de `/payments`.
 * 2. **La cota superior del backend es EXCLUSIVA**, por eso «hasta el 8
 *    inclusive» se pide con `plusDays: 1` (el 9 a las 00:00). Mandando el 8 se
 *    perdía todo lo creado ese mismo día — justo el día que el operador eligió.
 * 3. **Un día imposible no rompe la pantalla.** El valor viene de la URL y
 *    `toISOString()` de un `Invalid Date` LANZA: sin la guarda, `?from=lol`
 *    reventaba el render en vez de leerse como «sin filtro».
 */
function dayIso(day: string | undefined, plusDays: number): string | undefined {
  if (!day) return undefined;
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setDate(d.getDate() + plusDays);
  return d.toISOString();
}

export interface CustomerSearchParams {
  search?: string;
  limit?: number;
  offset?: number;
  ordering?: CustomerOrdering;
  /**
   * Días de calendario `YYYY-MM-DD`, **los dos inclusivos** — se nombran así, y
   * no como los `created_from`/`created_to` del backend, porque ahí son
   * `date-time` y la cota de arriba es exclusiva. La conversión es de esta capa:
   * un componente que tuviera que acordarse de sumar un día es el componente que
   * un día se olvida.
   */
  createdFrom?: string;
  createdTo?: string;
}

/** Server-side search/ordering/pagination (customer combobox and Customers table). */
export async function searchCustomers(
  params: CustomerSearchParams = {},
): Promise<Paginated<Customer>> {
  const res = await api.get<Page>("/customers/", {
    query: {
      search: params.search,
      ordering: params.ordering,
      created_from: dayIso(params.createdFrom, 0),
      created_to: dayIso(params.createdTo, 1),
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
    },
  });
  return { items: res.items.map(fromBackend), count: res.count };
}

export function getCustomer(id: string): Promise<Customer> {
  return api.get<BackendCustomer>(`/customers/${id}/`).then(fromBackend);
}

interface CreateCustomerInput {
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
