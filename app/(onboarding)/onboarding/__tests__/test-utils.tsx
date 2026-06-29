/**
 * Shared test harness for onboarding step components.
 *
 * Mirrors lib/onboarding/__tests__/onboarding-context.test.tsx:
 *   - MSW handlers per test (server.use)
 *   - AuthProvider wraps every render (the api client needs a token in memory)
 *   - next/navigation is vi.mock'd by the importing test file
 */
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { AuthProvider } from "@/lib/auth";
import { OnboardingProvider } from "@/lib/onboarding";
import { server } from "@/mocks/server";

export const BASE = "http://localhost:8050/api";

/** Mock an authenticated session so the api client has a token in memory. */
export function mockAuthenticatedSession() {
  server.use(
    http.post(`${BASE}/auth/refresh/`, () =>
      HttpResponse.json({
        access_token: "jwe-test",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    ),
    http.get(`${BASE}/auth/me/`, () =>
      HttpResponse.json({ id: "u1", email: "owner@petspa.cl", name: "Owner" }),
    ),
  );
}

interface RehydrationOverrides {
  professionals?: unknown;
  services?: unknown;
  users?: unknown;
  agents?: unknown;
}

/** Default rehydration handlers (empty), overridable per resource. */
export function mockRehydration(overrides: RehydrationOverrides = {}) {
  server.use(
    http.get(`${BASE}/professionals/`, () =>
      HttpResponse.json(overrides.professionals ?? []),
    ),
    http.get(`${BASE}/services/`, () =>
      HttpResponse.json(overrides.services ?? []),
    ),
    http.get(`${BASE}/users/`, () =>
      HttpResponse.json(
        overrides.users ?? [
          { id: 1, email: "owner@petspa.cl", role: "owner", is_active: true },
        ],
      ),
    ),
    http.get(`${BASE}/agents/`, () =>
      HttpResponse.json(overrides.agents ?? { items: [], count: 0 }),
    ),
    http.get(`${BASE}/businesses/me/`, () =>
      HttpResponse.json({
        id: 1,
        name: "PET Spa",
        country: "CL",
        currency: "CLP",
        language: "es",
        timezone: "America/Santiago",
        active: false,
        onboarding_status: "in_progress",
        assistant_config: {},
      }),
    ),
  );
}

/** Renders a step component inside the auth + onboarding providers. */
export function renderStep(ui: ReactNode) {
  return render(
    <AuthProvider>
      <OnboardingProvider>{ui}</OnboardingProvider>
    </AuthProvider>,
  );
}
