import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { completeOnboarding, getBusinessSchedule } from "@/lib/api/businesses";

const API = "http://localhost:8050/api";

describe("businesses api", () => {
  it("completeOnboarding returns ok on 200", async () => {
    server.use(http.post(`${API}/businesses/me/onboarding/complete/`, () =>
      HttpResponse.json({ id: 1, name: "Acme", country: "CL", currency: "CLP", language: "es", timezone: "America/Santiago", active: true, onboarding_status: "completed", assistant_config: {} })));
    expect(await completeOnboarding()).toEqual({ ok: true });
  });

  it("completeOnboarding returns missing_steps on 400", async () => {
    server.use(http.post(`${API}/businesses/me/onboarding/complete/`, () =>
      HttpResponse.json({ missing_steps: ["whatsapp"] }, { status: 400 })));
    expect(await completeOnboarding()).toEqual({ ok: false, missing_steps: ["whatsapp"] });
  });

  it("getBusinessSchedule GETs /businesses/me/schedule/ and returns windows", async () => {
    server.use(http.get(`${API}/businesses/me/schedule/`, () =>
      HttpResponse.json([{ day_of_week: 1, start_time: "08:00", end_time: "17:00" }]),
    ));
    const windows = await getBusinessSchedule();
    expect(windows).toEqual([{ day_of_week: 1, start_time: "08:00", end_time: "17:00" }]);
  });
});
