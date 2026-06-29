/**
 * Tests for OnboardingPage — the full wizard including resume logic.
 *
 * Patterns mirrored from test-utils and step-adapted.test.tsx:
 * - AuthProvider + OnboardingProvider wrap the page (via renderPage)
 * - MSW handlers per test (server.use)
 * - next/navigation vi.mock'd
 */
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";
import { server } from "@/mocks/server";
import OnboardingPage from "../page";

import { BASE, mockAuthenticatedSession } from "./test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderPage() {
  return render(
    <AuthProvider>
      <OnboardingPage />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticatedSession();
});

/**
 * Mocks full rehydration with steps 1 and 2 satisfied, but step 3 pending
 * (weeklySchedule is empty → horarios step is the first pending step).
 */
function mockRehydrationSteps1And2Done() {
  server.use(
    // Step 1: business info fully populated
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
    // Step 2: at least one professional with a name
    http.get(`${BASE}/professionals/`, () =>
      HttpResponse.json([
        { id: "pro-1", name: "María Pérez", active: true },
      ]),
    ),
    // Step 3: empty schedule → horarios is pending
    http.get(`${BASE}/businesses/me/schedule/`, () =>
      HttpResponse.json([]),
    ),
    // Other endpoints (steps 4, 5, 7)
    http.get(`${BASE}/services/`, () => HttpResponse.json([])),
    http.get(`${BASE}/users/`, () =>
      HttpResponse.json([
        { id: "u1", email: "owner@petspa.cl", role: "owner", is_active: true },
      ]),
    ),
    http.get(`${BASE}/agents/`, () => HttpResponse.json({ items: [], count: 0 })),
  );
}

describe("OnboardingPage — resume to first pending step", () => {
  it("lands on step 3 (Horarios de atención) when steps 1–2 are satisfied but schedule is empty", async () => {
    mockRehydrationSteps1And2Done();

    renderPage();

    // Loading initially
    expect(screen.getByText(/cargando el onboarding/i)).toBeInTheDocument();

    // After rehydration + init, the wizard should jump to step 3
    // (CardTitle renders as a <div>, use getByText)
    await waitFor(
      () =>
        expect(
          screen.getByText(/horarios de atención/i),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it("steps 1 and 2 appear as completed/clickable in the stepper after resume", async () => {
    mockRehydrationSteps1And2Done();

    renderPage();

    await waitFor(
      () =>
        expect(
          screen.getByText(/horarios de atención/i),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    );

    // Step 1 (Negocio) and Step 2 (Profesionales) stepper buttons should be
    // enabled (completed steps are clickable).
    // The stepper buttons are inside the <nav aria-label="Progreso del onboarding">
    const nav = screen.getByRole("navigation", { name: /progreso/i });
    const stepperButtons = Array.from(nav.querySelectorAll("button"));

    // Find the Negocio and Profesionales buttons by their label text
    const negocioBtn = stepperButtons.find((b) => b.textContent?.includes("Negocio"));
    const profesionalesBtn = stepperButtons.find((b) =>
      b.textContent?.includes("Profesionales"),
    );

    expect(negocioBtn).toBeDefined();
    expect(profesionalesBtn).toBeDefined();
    expect(negocioBtn).not.toBeDisabled();
    expect(profesionalesBtn).not.toBeDisabled();
  });
});
