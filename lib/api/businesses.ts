import type { Business, OnboardingState } from "@/lib/types";

import { api } from "./client";

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
