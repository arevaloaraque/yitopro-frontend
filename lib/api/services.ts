import type { Service } from "@/lib/types";

import { api } from "./client";

export function listServices(): Promise<Service[]> {
  return api.get<Service[]>("/services");
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
