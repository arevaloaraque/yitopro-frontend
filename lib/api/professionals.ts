import type { Professional, ScheduleWindow } from "@/lib/types";

import { api } from "./client";

/**
 * Actual backend shape (Django Ninja `ProfessionalOut`). It differs from the UI
 * type: `id` is an integer and `active` (not `is_active`). The mapping lives here
 * so components consume `Professional` unchanged.
 */
interface BackendProfessional {
  id: number;
  name: string;
  active: boolean;
}

function fromBackend(p: BackendProfessional): Professional {
  return {
    id: String(p.id),
    name: p.name,
    is_active: p.active,
  };
}

export async function listProfessionals(): Promise<Professional[]> {
  const res = await api.get<BackendProfessional[]>("/professionals/");
  return res.map(fromBackend);
}

export function createProfessional(input: { name: string; is_active?: boolean }): Promise<Professional> {
  return api
    .post<BackendProfessional>("/professionals/", {
      name: input.name,
      active: input.is_active ?? true,
    })
    .then(fromBackend);
}

export function updateProfessional(
  id: string,
  patch: { name?: string; is_active?: boolean },
): Promise<Professional> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.is_active !== undefined) body.active = patch.is_active;
  return api.patch<BackendProfessional>(`/professionals/${id}/`, body).then(fromBackend);
}

export function deleteProfessional(id: string): Promise<void> {
  return api.delete<void>(`/professionals/${id}/`);
}

export function putProfessionalSchedule(
  id: string,
  windows: ScheduleWindow[],
): Promise<ScheduleWindow[]> {
  return api.put<ScheduleWindow[]>(`/professionals/${id}/schedule/`, windows);
}

/** Fetches a single professional's schedule windows. */
export function getProfessionalSchedule(id: string): Promise<ScheduleWindow[]> {
  return api.get<ScheduleWindow[]>(`/professionals/${id}/schedule/`);
}
