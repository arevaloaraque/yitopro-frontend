import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { AuthProvider, useAuth } from "@/lib/auth";
import { server } from "@/mocks/server";

const BASE = "http://localhost:8050/api";

function Probe() {
  const { isAuthenticated, user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{isAuthenticated ? "in" : "out"}</span>
      <span data-testid="email">{user?.email ?? ""}</span>
      <button onClick={() => login("a@b.com", "pw").catch(() => {})}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe("AuthContext", () => {
  // By default, the silent boot refresh finds no session (401), so the app
  // starts as "out" deterministically. Tests that exercise session restoration
  // override this handler.
  beforeEach(() => {
    server.use(
      http.post(`${BASE}/auth/refresh/`, () =>
        HttpResponse.json({ detail: "no session" }, { status: 401 }),
      ),
    );
  });

  it("logs in: token en memoria, identidad desde /api/auth/me, marca authenticated", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/auth/login/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ access_token: "jwe", expires_in: 3600, token_type: "Bearer" });
      }),
      http.get(`${BASE}/auth/me/`, () =>
        HttpResponse.json({ id: "u1", email: "a@b.com", name: "Demo User" }),
      ),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("out"));
    await userEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("in"));
    expect(screen.getByTestId("email").textContent).toBe("a@b.com");
    expect(body).toEqual({ email: "a@b.com", password: "pw" });
  });

  it("on 401 stays logged out (auth routes skip the refresh interceptor)", async () => {
    server.use(
      http.post(`${BASE}/auth/login/`, () =>
        HttpResponse.json({ detail: "Invalid credentials" }, { status: 401 }),
      ),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await userEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("out"));
  });

  it("logout calls the backend logout endpoint and clears the session", async () => {
    let loggedOut = false;
    server.use(
      http.post(`${BASE}/auth/login/`, () =>
        HttpResponse.json({ access_token: "jwe", expires_in: 3600, token_type: "Bearer" }),
      ),
      http.get(`${BASE}/auth/me/`, () =>
        HttpResponse.json({ id: "u1", email: "a@b.com", name: "Demo User" }),
      ),
      http.post(`${BASE}/auth/logout/`, () => {
        loggedOut = true;
        return HttpResponse.json({ detail: "logged out" });
      }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await userEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("in"));
    await userEvent.click(screen.getByText("logout"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("out"));
    await waitFor(() => expect(loggedOut).toBe(true));
  });

  it("restaura la sesión en el arranque vía refresh + /me (persistencia al recargar)", async () => {
    server.use(
      http.post(`${BASE}/auth/refresh/`, () =>
        HttpResponse.json({ access_token: "jwe2", expires_in: 3600, token_type: "Bearer" }),
      ),
      http.get(`${BASE}/auth/me/`, () =>
        HttpResponse.json({ id: "u9", email: "boot@b.com", name: "Boot User" }),
      ),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    // Without going through login: boot restores the session using the refresh cookie.
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("in"));
    expect(screen.getByTestId("email").textContent).toBe("boot@b.com");
  });
});
