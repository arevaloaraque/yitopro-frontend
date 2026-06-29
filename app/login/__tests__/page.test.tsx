/**
 * Tests for the /login page — onboarding-status-aware routing.
 *
 * After a successful login (or when already authenticated), the page fetches
 * the onboarding status and routes:
 *   - status !== "completed" → /onboarding
 *   - status === "completed" → /dashboard
 *   - status fetch error    → /dashboard (resilient)
 *
 * Patterns mirrored from app/activar/__tests__/page.test.tsx.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "../page";
import { AuthProvider } from "@/lib/auth";
import { server } from "@/mocks/server";

const BASE = "http://localhost:8050/api";

// ── next/navigation mock ──────────────────────────────────────────────────────

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
}

/** Sets up a fresh unauthenticated session (boot refresh 401s). */
beforeEach(() => {
  vi.clearAllMocks();

  // Boot refresh fails → provider starts "unauthenticated" synchronously.
  server.use(
    http.post(`${BASE}/auth/refresh/`, () =>
      HttpResponse.json({ detail: "no session" }, { status: 401 }),
    ),
  );
});

// ── helpers for successful login ──────────────────────────────────────────────

function mockSuccessfulLogin() {
  server.use(
    http.post(`${BASE}/auth/login/`, () =>
      HttpResponse.json({ access_token: "jwe", expires_in: 3600, token_type: "Bearer" }),
    ),
    http.get(`${BASE}/auth/me/`, () =>
      HttpResponse.json({ id: "u1", email: "owner@petsspa.cl", name: "PET Spa Owner" }),
    ),
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("/login page", () => {
  it("renders the login form when unauthenticated", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument(),
    );

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  describe("post-login routing — status-aware", () => {
    it('routes to /onboarding when onboarding status is "not_started"', async () => {
      mockSuccessfulLogin();
      server.use(
        http.get(`${BASE}/businesses/me/onboarding/`, () =>
          HttpResponse.json({ status: "not_started", steps: [] }),
        ),
      );

      renderPage();

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument(),
      );

      await userEvent.type(screen.getByLabelText(/email/i), "owner@petsspa.cl");
      await userEvent.type(screen.getByLabelText(/contraseña/i), "Segura1234!");
      await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith("/onboarding"),
      );
    });

    it('routes to /onboarding when onboarding status is "in_progress"', async () => {
      mockSuccessfulLogin();
      server.use(
        http.get(`${BASE}/businesses/me/onboarding/`, () =>
          HttpResponse.json({
            status: "in_progress",
            steps: [{ key: "business_info", label: "Business Info", completed: true }],
          }),
        ),
      );

      renderPage();

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument(),
      );

      await userEvent.type(screen.getByLabelText(/email/i), "owner@petsspa.cl");
      await userEvent.type(screen.getByLabelText(/contraseña/i), "Segura1234!");
      await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith("/onboarding"),
      );
    });

    it('routes to /dashboard when onboarding status is "completed"', async () => {
      mockSuccessfulLogin();
      server.use(
        http.get(`${BASE}/businesses/me/onboarding/`, () =>
          HttpResponse.json({ status: "completed", steps: [] }),
        ),
      );

      renderPage();

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument(),
      );

      await userEvent.type(screen.getByLabelText(/email/i), "owner@petsspa.cl");
      await userEvent.type(screen.getByLabelText(/contraseña/i), "Segura1234!");
      await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith("/dashboard"),
      );
    });

    it("routes to /dashboard when onboarding status fetch fails (resilient)", async () => {
      mockSuccessfulLogin();
      server.use(
        http.get(`${BASE}/businesses/me/onboarding/`, () =>
          HttpResponse.json({ detail: "Server error" }, { status: 500 }),
        ),
      );

      renderPage();

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument(),
      );

      await userEvent.type(screen.getByLabelText(/email/i), "owner@petsspa.cl");
      await userEvent.type(screen.getByLabelText(/contraseña/i), "Segura1234!");
      await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith("/dashboard"),
      );
    });
  });

  describe("already-authenticated routing", () => {
    it('routes to /onboarding when already authenticated and status is "not_started"', async () => {
      // Override the boot refresh to succeed → starts authenticated.
      server.use(
        http.post(`${BASE}/auth/refresh/`, () =>
          HttpResponse.json({ access_token: "jwe-boot", expires_in: 3600, token_type: "Bearer" }),
        ),
        http.get(`${BASE}/auth/me/`, () =>
          HttpResponse.json({ id: "u1", email: "owner@petsspa.cl", name: "PET Spa Owner" }),
        ),
        http.get(`${BASE}/businesses/me/onboarding/`, () =>
          HttpResponse.json({ status: "not_started", steps: [] }),
        ),
      );

      renderPage();

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith("/onboarding"),
      );
    });

    it('routes to /dashboard when already authenticated and status is "completed"', async () => {
      server.use(
        http.post(`${BASE}/auth/refresh/`, () =>
          HttpResponse.json({ access_token: "jwe-boot", expires_in: 3600, token_type: "Bearer" }),
        ),
        http.get(`${BASE}/auth/me/`, () =>
          HttpResponse.json({ id: "u1", email: "owner@petsspa.cl", name: "PET Spa Owner" }),
        ),
        http.get(`${BASE}/businesses/me/onboarding/`, () =>
          HttpResponse.json({ status: "completed", steps: [] }),
        ),
      );

      renderPage();

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith("/dashboard"),
      );
    });
  });

  describe("login error handling", () => {
    it("shows error message on invalid credentials (401)", async () => {
      server.use(
        http.post(`${BASE}/auth/login/`, () =>
          HttpResponse.json({ detail: "Invalid credentials" }, { status: 401 }),
        ),
      );

      renderPage();

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument(),
      );

      await userEvent.type(screen.getByLabelText(/email/i), "bad@user.cl");
      await userEvent.type(screen.getByLabelText(/contraseña/i), "wrongpass");
      await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(/incorrectos/i),
      );
    });
  });
});
