import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { inviteUser, listUsers } from "@/lib/api/users";

const API = "http://localhost:8050/api";

describe("users api", () => {
  it("lists users mapping role/active", async () => {
    server.use(http.get(`${API}/users/`, () =>
      HttpResponse.json([{ id: 3, email: "a@b.cl", role: "staff", is_active: true }])));
    expect(await listUsers()).toEqual([{ id: "3", email: "a@b.cl", role: "staff", is_active: true }]);
  });

  it("invites a user (POST email+role)", async () => {
    server.use(http.post(`${API}/users/`, async ({ request }) => {
      expect(await request.json()).toEqual({ email: "x@y.cl", role: "staff" });
      return HttpResponse.json({ id: 9, email: "x@y.cl", role: "staff", is_active: true }, { status: 201 });
    }));
    expect((await inviteUser({ email: "x@y.cl", role: "staff" })).id).toBe("9");
  });
});
