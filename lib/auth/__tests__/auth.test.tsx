import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

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

describe("AuthContext login flow", () => {
  it("logs in: token in memory, email derived from the form, marked authenticated", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/auth/login/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ access_token: "jwe", expires_in: 3600, token_type: "Bearer" });
      }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId("status").textContent).toBe("out");
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
});
