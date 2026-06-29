/**
 * Tests for the rewritten onboarding context (server persistence + rehydration).
 *
 * Patterns mirrored from app/login/__tests__/page.test.tsx and
 * lib/onboarding/__tests__/use-onboarding-redirect.test.tsx:
 *   - MSW handlers per test (server.use)
 *   - AuthProvider wraps all renders (the api client needs a token in memory)
 *   - next/navigation is vi.mock'd — useRouter returns { push: mockPush }
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";
import { server } from "@/mocks/server";

import { OnboardingProvider, useOnboarding } from "../onboarding-context";

const BASE = "http://localhost:8050/api";

// ── next/navigation mock ──────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── probe component ───────────────────────────────────────────────────────────

function Probe() {
  const { data, loading, addService, complete } = useOnboarding();
  return (
    <div>
      <span data-testid="loading">{loading ? "yes" : "no"}</span>
      <span data-testid="pros">
        {data.professionals.map((p) => p.name).join(",")}
      </span>
      <span data-testid="services">
        {data.services.map((s) => s.name).join(",")}
      </span>
      <span data-testid="whatsapp-connected">
        {data.whatsappConnected ? "yes" : "no"}
      </span>
      <button
        onClick={() =>
          addService({
            name: "Baño",
            duration_minutes: 45,
            price: 12000,
            is_active: true,
          }).catch(() => {})
        }
      >
        add-service
      </button>
      <button onClick={() => complete().catch(() => {})}>complete</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>
    </AuthProvider>,
  );
}

// ── rehydration stubs ─────────────────────────────────────────────────────────

/** Mock an authenticated session so the api client has a token in memory. */
function mockAuthenticatedSession() {
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

/** Default rehydration handlers: one seeded professional, otherwise empty. */
function mockRehydration() {
  server.use(
    http.get(`${BASE}/professionals/`, () =>
      HttpResponse.json([{ id: 3, name: "Ana", active: true }]),
    ),
    http.get(`${BASE}/services/`, () => HttpResponse.json([])),
    http.get(`${BASE}/users/`, () =>
      HttpResponse.json([
        { id: 1, email: "owner@petspa.cl", role: "owner", is_active: true },
      ]),
    ),
    http.get(`${BASE}/agents/`, () =>
      HttpResponse.json({ items: [], count: 0 }),
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
    // Default: whatsapp step not completed
    http.get(`${BASE}/businesses/me/onboarding/`, () =>
      HttpResponse.json({ status: "in_progress", steps: [] }),
    ),
    // Default: no schedule windows
    http.get(`${BASE}/businesses/me/schedule/`, () =>
      HttpResponse.json([]),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticatedSession();
  mockRehydration();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("OnboardingProvider", () => {
  it("rehydrates a seeded professional into data on mount", async () => {
    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );
    expect(screen.getByTestId("pros").textContent).toBe("Ana");
  });

  it("addService POSTs to the backend and appends the returned row", async () => {
    let posted: unknown;
    server.use(
      http.post(`${BASE}/services/`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          {
            id: 10,
            name: "Baño",
            description: "",
            duration_minutes: 45,
            price: "12000",
            active: true,
          },
          { status: 201 },
        );
      }),
    );

    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );

    await userEvent.click(screen.getByText("add-service"));

    await waitFor(() =>
      expect(screen.getByTestId("services").textContent).toBe("Baño"),
    );
    expect(posted).toEqual({
      name: "Baño",
      duration_minutes: 45,
      price: 12000,
      active: true,
    });
  });

  it("seeds data.weeklySchedule from the business schedule endpoint on mount", async () => {
    function ProbeWithSchedule() {
      const { data, loading } = useOnboarding();
      return (
        <div>
          <span data-testid="loading">{loading ? "yes" : "no"}</span>
          <span data-testid="schedule-count">{data.weeklySchedule.length}</span>
        </div>
      );
    }

    server.use(
      http.get(`${BASE}/businesses/me/schedule/`, () =>
        HttpResponse.json([
          { day_of_week: 2, start_time: "10:00", end_time: "19:00" },
        ]),
      ),
    );

    render(
      <AuthProvider>
        <OnboardingProvider>
          <ProbeWithSchedule />
        </OnboardingProvider>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );
    expect(screen.getByTestId("schedule-count").textContent).toBe("1");
  });

  it("complete() navigates to /dashboard when the backend returns ok", async () => {
    server.use(
      http.post(`${BASE}/businesses/me/onboarding/complete/`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );

    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );

    await userEvent.click(screen.getByText("complete"));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/dashboard"),
    );
  });

  it("rehydrates data.whatsappConnected as true when the onboarding status endpoint returns whatsapp step completed", async () => {
    server.use(
      http.get(`${BASE}/businesses/me/onboarding/`, () =>
        HttpResponse.json({
          status: "in_progress",
          steps: [
            { key: "whatsapp", label: "WhatsApp", completed: true },
          ],
        }),
      ),
    );

    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );

    expect(screen.getByTestId("whatsapp-connected").textContent).toBe("yes");
  });

  it("leaves data.whatsappConnected as false and does not blank the wizard when the onboarding status endpoint errors", async () => {
    server.use(
      http.get(`${BASE}/businesses/me/onboarding/`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );

    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );

    // Wizard loaded (not blanked) and whatsappConnected remains false
    expect(screen.getByTestId("pros").textContent).toBe("Ana");
    expect(screen.getByTestId("whatsapp-connected").textContent).toBe("no");
  });
});
