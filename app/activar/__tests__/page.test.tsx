/**
 * Tests for the /activar (set-password) page.
 *
 * Patterns mirrored from lib/auth/__tests__/auth.test.tsx:
 * - MSW handlers per test (server.use)
 * - AuthProvider wraps all renders
 * - next/navigation is vi.mock'd — useSearchParams returns a URLSearchParams stub,
 *   useRouter returns a mock with `replace` tracked by vi.fn()
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ActivarPage from "../page";
import { AuthProvider } from "@/lib/auth";
import { server } from "@/mocks/server";

const BASE = "http://localhost:8050/api";

// ── next/navigation mock ──────────────────────────────────────────────────────
// useSearchParams returns a stub driven by module-level `currentToken`.
// useRouter returns { replace: mockReplace } so we can assert navigation.

const mockReplace = vi.fn();
let currentToken = "valid-token-abc";

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? currentToken : null),
  }),
  useRouter: () => ({ replace: mockReplace }),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <AuthProvider>
      <ActivarPage />
    </AuthProvider>,
  );
}

// The boot refresh always 401s so the provider starts "unauthenticated".
beforeEach(() => {
  vi.clearAllMocks();
  currentToken = "valid-token-abc";

  server.use(
    http.post(`${BASE}/auth/refresh/`, () =>
      HttpResponse.json({ detail: "no session" }, { status: 401 }),
    ),
  );
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("/activar page", () => {
  describe("valid token flow", () => {
    beforeEach(() => {
      server.use(
        http.get(`${BASE}/auth/invite/validate/`, () =>
          HttpResponse.json({ valid: true }),
        ),
      );
    });

    it("shows the set-password form after token validation succeeds", async () => {
      renderPage();

      // After validation, the form must appear.
      // CardTitle renders as a <div>, so use getByText, not getByRole("heading").
      await waitFor(() =>
        expect(screen.getByText(/crea tu contraseña/i)).toBeInTheDocument(),
      );

      expect(screen.getByLabelText(/^contraseña$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirmar/i)).toBeInTheDocument();
    });

    it("navigates to /onboarding after successful password submission", async () => {
      server.use(
        http.post(`${BASE}/auth/invite/accept/`, async ({ request }) => {
          const body = (await request.json()) as { token: string; password: string };
          expect(body.token).toBe("valid-token-abc");
          expect(body.password).toBe("Segura1234!");
          return HttpResponse.json({
            access_token: "inv-jwe",
            expires_in: 3600,
            token_type: "Bearer",
          });
        }),
        http.get(`${BASE}/auth/me/`, () =>
          HttpResponse.json({ id: "u1", email: "staff@petspa.cl", name: "Groomer" }),
        ),
      );

      renderPage();

      await waitFor(() =>
        expect(screen.getByText(/crea tu contraseña/i)).toBeInTheDocument(),
      );

      const passwordInput = screen.getByLabelText(/^contraseña$/i);
      const confirmInput = screen.getByLabelText(/confirmar/i);

      await userEvent.type(passwordInput, "Segura1234!");
      await userEvent.type(confirmInput, "Segura1234!");

      await userEvent.click(screen.getByRole("button", { name: /activar/i }));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith("/onboarding"),
      );
    });

    it("surfaces ApiError 400 backend message on weak password", async () => {
      server.use(
        http.post(`${BASE}/auth/invite/accept/`, () =>
          HttpResponse.json(
            { detail: "Esta contraseña es demasiado común." },
            { status: 400 },
          ),
        ),
      );

      renderPage();

      await waitFor(() =>
        expect(screen.getByText(/crea tu contraseña/i)).toBeInTheDocument(),
      );

      const passwordInput = screen.getByLabelText(/^contraseña$/i);
      const confirmInput = screen.getByLabelText(/confirmar/i);

      await userEvent.type(passwordInput, "Password1!");
      await userEvent.type(confirmInput, "Password1!");

      await userEvent.click(screen.getByRole("button", { name: /activar/i }));

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(/demasiado común/i),
      );
    });
  });

  describe("invalid token flow", () => {
    it("renders the invalid-link error message and no form when token is missing", async () => {
      currentToken = "";

      renderPage();

      await waitFor(() =>
        expect(screen.getByText(/inválido o expiró/i)).toBeInTheDocument(),
      );

      // No form rendered
      expect(screen.queryByText(/crea tu contraseña/i)).not.toBeInTheDocument();
    });

    it("renders the invalid-link error message when validate returns false", async () => {
      currentToken = "bad-token-xyz";

      server.use(
        http.get(`${BASE}/auth/invite/validate/`, () =>
          HttpResponse.json({ valid: false }),
        ),
      );

      renderPage();

      await waitFor(() =>
        expect(screen.getByText(/inválido o expiró/i)).toBeInTheDocument(),
      );

      // No form rendered
      expect(screen.queryByText(/crea tu contraseña/i)).not.toBeInTheDocument();
    });
  });
});
