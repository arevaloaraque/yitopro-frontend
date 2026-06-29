import type { Business, OnboardingState, ScheduleWindow } from "@/lib/types";

import { api, ApiError } from "./client";

/**
 * The backend exposes the business at `/businesses/me/` with some extra fields
 * and `active`/`id:int`. We map here (contract layer) so components keep
 * consuming the stable `Business` type, without touching the UI.
 */
interface BackendBusiness {
  id: number;
  name: string;
  country: string;
  currency: string;
  language: string;
  timezone: string;
  active: boolean;
  onboarding_status: Business["onboarding_status"];
  assistant_config: Business["assistant_config"];
}

function toBusiness(b: BackendBusiness): Business {
  return {
    id: String(b.id),
    name: b.name,
    country: b.country,
    currency: b.currency,
    language: b.language,
    timezone: b.timezone,
    is_active: b.active,
    onboarding_status: b.onboarding_status,
    assistant_config: b.assistant_config,
  };
}

/** Current tenant's business. */
export async function getBusiness(): Promise<Business> {
  return toBusiness(await api.get<BackendBusiness>("/businesses/me/"));
}

/** Updates business fields (including the nested `assistant_config`). */
export async function updateBusiness(
  patch: Partial<Omit<Business, "id">>,
): Promise<Business> {
  const { is_active, ...rest } = patch;
  const body = is_active === undefined ? rest : { ...rest, active: is_active };
  return toBusiness(await api.patch<BackendBusiness>("/businesses/me/", body));
}

/** Detailed onboarding status (the backend already returns the exact shape). */
export function getOnboardingStatus(): Promise<OnboardingState> {
  return api.get<OnboardingState>("/businesses/me/onboarding/");
}

/**
 * Replaces the business-wide default schedule with the given windows.
 * Returns how many professionals were updated with the new defaults.
 */
export function putBusinessSchedule(
  windows: ScheduleWindow[],
): Promise<{ professionals_updated: number }> {
  return api.put<{ professionals_updated: number }>(
    "/businesses/me/schedule/",
    windows,
  );
}

/** Fetches the current business-wide default schedule. */
export function getBusinessSchedule(): Promise<ScheduleWindow[]> {
  return api.get<ScheduleWindow[]>("/businesses/me/schedule/");
}

/**
 * Marks the onboarding flow as complete.
 * - 200: returns `{ ok: true }`.
 * - 400: catches `ApiError` and returns `{ ok: false, missing_steps }`.
 * - Any other error is re-thrown.
 */
export async function completeOnboarding(): Promise<{
  ok: boolean;
  missing_steps?: string[];
}> {
  try {
    await api.post("/businesses/me/onboarding/complete/");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      const body = err.body as { missing_steps?: string[] } | null;
      return { ok: false, missing_steps: body?.missing_steps ?? [] };
    }
    throw err;
  }
}
