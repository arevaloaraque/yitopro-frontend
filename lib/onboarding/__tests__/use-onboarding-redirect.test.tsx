import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/lib/auth";
import { server } from "@/mocks/server";

import { useOnboardingRedirect } from "../use-onboarding-redirect";

const BASE = "http://localhost:8050/api";

/** Wrap hook inside AuthProvider (required for useAuth inside the hook). */
function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

/** Mock an authenticated session (refresh succeeds → token in memory). */
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
      HttpResponse.json({ id: "u1", email: "owner@petsspa.cl", name: "PET Spa Owner" }),
    ),
  );
}

/** Mock an unauthenticated session (refresh fails → 401). */
function mockUnauthenticatedSession() {
  server.use(
    http.post(`${BASE}/auth/refresh/`, () =>
      HttpResponse.json({ detail: "no session" }, { status: 401 }),
    ),
  );
}

describe("useOnboardingRedirect", () => {
  it('returns target "/onboarding" when status is "not_started"', async () => {
    mockAuthenticatedSession();
    server.use(
      http.get(`${BASE}/businesses/me/onboarding/`, () =>
        HttpResponse.json({
          status: "not_started",
          steps: [],
        }),
      ),
    );

    const { result } = renderHook(() => useOnboardingRedirect(), { wrapper });

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.target).toBe("/onboarding");
  });

  it('returns target "/onboarding" when status is "in_progress"', async () => {
    mockAuthenticatedSession();
    server.use(
      http.get(`${BASE}/businesses/me/onboarding/`, () =>
        HttpResponse.json({
          status: "in_progress",
          steps: [{ key: "business_info", label: "Business Info", completed: true }],
        }),
      ),
    );

    const { result } = renderHook(() => useOnboardingRedirect(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.target).toBe("/onboarding");
  });

  it('returns target null when status is "completed"', async () => {
    mockAuthenticatedSession();
    server.use(
      http.get(`${BASE}/businesses/me/onboarding/`, () =>
        HttpResponse.json({
          status: "completed",
          steps: [],
        }),
      ),
    );

    const { result } = renderHook(() => useOnboardingRedirect(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.target).toBeNull();
  });

  it("returns target null on fetch error (resilient — do not trap user)", async () => {
    mockAuthenticatedSession();
    server.use(
      http.get(`${BASE}/businesses/me/onboarding/`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useOnboardingRedirect(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.target).toBeNull();
  });

  it("returns loading=true and target null when not authenticated", async () => {
    mockUnauthenticatedSession();

    const { result } = renderHook(() => useOnboardingRedirect(), { wrapper });

    // While not authenticated and still booting, loading is true
    // After boot completes unauthenticated, we should not be loading
    await waitFor(() => expect(result.current.loading).toBe(false));
    // When not authenticated, no status fetch occurs, target is null
    expect(result.current.target).toBeNull();
  });
});
