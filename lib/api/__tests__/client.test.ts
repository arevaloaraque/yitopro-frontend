import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, configureApiAuth } from "@/lib/api";
import { server } from "@/mocks/server";

const BASE = "http://localhost:8050/api";

describe("apiFetch (lib/api/client)", () => {
  beforeEach(() => {
    configureApiAuth({
      getAccessToken: () => "tok",
      refreshSession: async () => false,
      onSessionExpired: () => {},
    });
  });

  it("returns parsed JSON and sends the Authorization header", async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${BASE}/ping`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ ok: true });
      }),
    );
    const res = await api.get<{ ok: boolean }>("/ping");
    expect(res.ok).toBe(true);
    expect(auth).toBe("Bearer tok");
  });

  it("builds query params, omitting null/undefined", async () => {
    let url = "";
    server.use(
      http.get(`${BASE}/items`, ({ request }) => {
        url = request.url;
        return HttpResponse.json([]);
      }),
    );
    await api.get("/items", { query: { a: "1", b: undefined, c: null } });
    expect(url).toContain("a=1");
    expect(url).not.toContain("b=");
    expect(url).not.toContain("c=");
  });

  it("throws ApiError with status on non-2xx", async () => {
    server.use(
      http.get(`${BASE}/boom`, () =>
        HttpResponse.json({ detail: "Nope" }, { status: 400 }),
      ),
    );
    await expect(api.get("/boom")).rejects.toBeInstanceOf(ApiError);
    await expect(api.get("/boom")).rejects.toMatchObject({ status: 400 });
  });

  it("passes the backend `detail` through on 4xx", async () => {
    server.use(
      http.get(`${BASE}/limited`, () =>
        HttpResponse.json({ detail: "Demasiados intentos." }, { status: 429 }),
      ),
    );
    await expect(api.get("/limited")).rejects.toMatchObject({
      message: "Demasiados intentos.",
    });
  });

  it("never surfaces a 5xx body: uses the Spanish status message", async () => {
    server.use(
      http.get(`${BASE}/crash`, () =>
        HttpResponse.json(
          { detail: "Traceback (most recent call last)…" },
          { status: 500 },
        ),
      ),
    );
    await expect(api.get("/crash")).rejects.toMatchObject({
      message: "El servidor tuvo un problema. Inténtalo más tarde.",
    });
  });

  it("falls back to a Spanish message on 4xx without detail", async () => {
    server.use(
      http.get(`${BASE}/teapot`, () => new HttpResponse(null, { status: 418 })),
    );
    await expect(api.get("/teapot")).rejects.toMatchObject({
      message: "Algo salió mal. Inténtalo de nuevo.",
    });
  });

  it("on 401 refreshes once and retries with the new token", async () => {
    const tokens = ["old", "new"];
    const refresh = vi.fn(async () => true);
    configureApiAuth({
      getAccessToken: () => tokens.shift() ?? "new",
      refreshSession: refresh,
      onSessionExpired: () => {},
    });
    server.use(
      http.get(`${BASE}/secure`, ({ request }) => {
        if (request.headers.get("authorization") === "Bearer old") {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );
    const res = await api.get<{ ok: boolean }>("/secure");
    expect(res.ok).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("on 401 with a failed refresh fires onSessionExpired and throws 401", async () => {
    const onExpired = vi.fn();
    configureApiAuth({
      getAccessToken: () => "old",
      refreshSession: async () => false,
      onSessionExpired: onExpired,
    });
    server.use(
      http.get(`${BASE}/secure2`, () => new HttpResponse(null, { status: 401 })),
    );
    await expect(api.get("/secure2")).rejects.toMatchObject({ status: 401 });
    expect(onExpired).toHaveBeenCalledOnce();
  });
});
