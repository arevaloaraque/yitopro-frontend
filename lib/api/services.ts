import type { Paginated, Service } from "@/lib/types";

import { api } from "./client";

export async function listServices(): Promise<Service[]> {
  const res = await api.get<Paginated<Service>>("/services");
  return res.items;
}

export type CreateServiceInput = Omit<Service, "id" | "business_id">;

export function createService(input: CreateServiceInput): Promise<Service> {
  return api.post<Service>("/services", input);
}

export function updateService(
  id: string,
  patch: Partial<Omit<Service, "id" | "business_id">>,
): Promise<Service> {
  return api.patch<Service>(`/services/${id}`, patch);
}
