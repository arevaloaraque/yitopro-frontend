import type { Paginated, Service } from "@/lib/types";

import { api } from "./client";

/**
 * Actual backend shape (Django Ninja `ServiceOut`). It differs from the UI
 * type: `id` is an integer, `active` (not `is_active`), `price` is a Decimal
 * serialized as a string, and it does not include `business_id` (handled via
 * tenant scope). The mapping lives here so components consume `Service`
 * unchanged.
 */
interface BackendService {
  id: number;
  name: string;
  description: string;
  duration_minutes: number;
  price: string;
  active: boolean;
}

interface Page {
  items: BackendService[];
  count: number;
}

function fromBackend(s: BackendService): Service {
  return {
    id: String(s.id),
    name: s.name,
    duration_minutes: s.duration_minutes,
    price: Number(s.price),
    is_active: s.active,
  };
}

/**
 * All services (for consumers that expect the full list: appointment/booking
 * dropdowns, dashboard, onboarding). Cap of 1000; the Services table uses the
 * paginated `searchServices`.
 */
export async function listServices(): Promise<Service[]> {
  const res = await api.get<Page>("/services/", { query: { limit: 1000 } });
  return res.items.map(fromBackend);
}

export interface ServiceSearchParams {
  search?: string;
  limit?: number;
  offset?: number;
}

/** Server-side search/pagination (Services table). */
export async function searchServices(
  params: ServiceSearchParams = {},
): Promise<Paginated<Service>> {
  const res = await api.get<Page>("/services/", {
    query: {
      search: params.search,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
    },
  });
  return { items: res.items.map(fromBackend), count: res.count };
}

export type CreateServiceInput = Omit<Service, "id" | "business_id">;

export function createService(input: CreateServiceInput): Promise<Service> {
  return api
    .post<BackendService>("/services/", {
      name: input.name,
      duration_minutes: input.duration_minutes,
      price: input.price,
      active: input.is_active,
    })
    .then(fromBackend);
}

export function updateService(
  id: string,
  patch: Partial<Omit<Service, "id" | "business_id">>,
): Promise<Service> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.duration_minutes !== undefined)
    body.duration_minutes = patch.duration_minutes;
  if (patch.price !== undefined) body.price = patch.price;
  if (patch.is_active !== undefined) body.active = patch.is_active;
  return api.patch<BackendService>(`/services/${id}/`, body).then(fromBackend);
}

export function deleteService(id: string): Promise<void> {
  return api.delete<void>(`/services/${id}/`);
}
