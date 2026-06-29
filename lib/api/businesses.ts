import type { Business, OnboardingState } from "@/lib/types";

import { api } from "./client";

/**
 * El backend expone el negocio en `/businesses/me/` con algunos campos extra y
 * `active`/`id:int`. Mapeamos aquí (capa de contrato) para que los componentes
 * sigan consumiendo el tipo `Business` estable, sin tocar la UI.
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

/** Negocio del tenant actual. */
export async function getBusiness(): Promise<Business> {
  return toBusiness(await api.get<BackendBusiness>("/businesses/me/"));
}

/** Actualiza campos del negocio (incluida `assistant_config` anidada). */
export async function updateBusiness(
  patch: Partial<Omit<Business, "id">>,
): Promise<Business> {
  const { is_active, ...rest } = patch;
  const body = is_active === undefined ? rest : { ...rest, active: is_active };
  return toBusiness(await api.patch<BackendBusiness>("/businesses/me/", body));
}

/** Estado detallado del onboarding (el backend ya devuelve el shape exacto). */
export function getOnboardingStatus(): Promise<OnboardingState> {
  return api.get<OnboardingState>("/businesses/me/onboarding/");
}
