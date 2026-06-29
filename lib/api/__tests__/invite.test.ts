import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/mocks/server";
import { acceptInvite, validateInvite } from "@/lib/api/invite";

const API = "http://localhost:8050/api";

describe("invite API", () => {
  it("validateInvite returns the boolean", async () => {
    server.use(
      http.get(`${API}/auth/invite/validate/`, () =>
        HttpResponse.json({ valid: true }),
      ),
    );
    expect(await validateInvite("tok")).toBe(true);
  });

  it("acceptInvite posts token+password and returns access_token", async () => {
    server.use(
      http.post(`${API}/auth/invite/accept/`, async ({ request }) => {
        expect(await request.json()).toEqual({
          token: "tok",
          password: "S3cret!!",
        });
        return HttpResponse.json({
          access_token: "AAA",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }),
    );
    expect((await acceptInvite("tok", "S3cret!!")).access_token).toBe("AAA");
  });
});
