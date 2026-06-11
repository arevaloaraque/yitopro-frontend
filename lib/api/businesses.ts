import type { Business, OnboardingState } from "@/lib/types";

import { api } from "./client";

/** Negocio del tenant actual. */
export function getBusiness(): Promise<Business> {
  return api.get<Business>("/business");
}

/** Actualiza campos del negocio (incluida `assistant_config`). */
export function updateBusiness(
  patch: Partial<Omit<Business, "id">>,
): Promise<Business> {
  return api.patch<Business>("/business", patch);
}

/** Estado detallado del onboarding. */
export function getOnboardingStatus(): Promise<OnboardingState> {
  return api.get<OnboardingState>("/business/onboarding");
}
