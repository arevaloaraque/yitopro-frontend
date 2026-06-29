import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { createProfessional, getProfessionalSchedule, listProfessionals, putProfessionalSchedule } from "@/lib/api/professionals";

const API = "http://localhost:8050/api";

describe("professionals api", () => {
  it("maps backend active->is_active on list", async () => {
    server.use(http.get(`${API}/professionals/`, () =>
      HttpResponse.json([{ id: 1, name: "Ana", active: true }]),
    ));
    const pros = await listProfessionals();
    expect(pros).toEqual([{ id: "1", name: "Ana", is_active: true }]);
  });

  it("sends name on create and maps the result", async () => {
    server.use(http.post(`${API}/professionals/`, async ({ request }) => {
      expect(await request.json()).toEqual({ name: "Ana", active: true });
      return HttpResponse.json({ id: 7, name: "Ana", active: true }, { status: 201 });
    }));
    expect(await createProfessional({ name: "Ana" })).toEqual({ id: "7", name: "Ana", is_active: true });
  });

  it("PUTs schedule windows as a list", async () => {
    server.use(http.put(`${API}/professionals/7/schedule/`, async ({ request }) => {
      expect(await request.json()).toEqual([{ day_of_week: 0, start_time: "09:00", end_time: "18:00" }]);
      return HttpResponse.json([{ day_of_week: 0, start_time: "09:00", end_time: "18:00" }]);
    }));
    const out = await putProfessionalSchedule("7", [{ day_of_week: 0, start_time: "09:00", end_time: "18:00" }]);
    expect(out).toHaveLength(1);
  });

  it("getProfessionalSchedule GETs /professionals/{id}/schedule/ and returns windows", async () => {
    server.use(http.get(`${API}/professionals/5/schedule/`, () =>
      HttpResponse.json([{ day_of_week: 0, start_time: "09:00", end_time: "13:00" }]),
    ));
    const windows = await getProfessionalSchedule("5");
    expect(windows).toEqual([{ day_of_week: 0, start_time: "09:00", end_time: "13:00" }]);
  });
});
