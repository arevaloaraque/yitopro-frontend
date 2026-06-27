import type { Service } from "@/lib/types";

import { api } from "./client";

/**
 * Shape real del backend (Django Ninja `ServiceOut`). Difiere del tipo de UI:
 * `id` es entero, `active` (no `is_active`), `price` es Decimal serializado
 * como string, y no incluye `business_id` (va por scope de tenant). El mapeo
 * vive aquí para que los componentes consuman `Service` sin cambios.
 */
interface BackendService {
  id: number;
  name: string;
  description: string;
  duration_minutes: number;
  price: string;
  active: boolean;
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

export async function listServices(): Promise<Service[]> {
  const res = await api.get<BackendService[]>("/services/");
  return res.map(fromBackend);
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
  if (patch.duration_minutes !== undefined) body.duration_minutes = patch.duration_minutes;
  if (patch.price !== undefined) body.price = patch.price;
  if (patch.is_active !== undefined) body.active = patch.is_active;
  return api.patch<BackendService>(`/services/${id}/`, body).then(fromBackend);
}
