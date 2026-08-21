import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import {
  completeOnboarding,
  createScheduleBlock,
  deleteScheduleBlock,
  getBusiness,
  getBusinessConfig,
  getBusinessHours,
  getBusinessSchedule,
  getScheduleBlocks,
  putBusinessHours,
  updateBusinessConfig,
} from "@/lib/api/businesses";

const API = "http://localhost:8050/api";

/** The 12 fields the tenant may write (10 of voice + the documented scheduling-policy
 * exception, product decision 2026-08-15) — everything else on the row is staff-only. */
const VOICE_KEYS = [
  "tone",
  "welcome_message",
  "fallback_message",
  "out_of_hours_message",
  "out_of_hours_ack_message",
  "human_handoff_message",
  "handoff_waiting_ack_message",
  "handoff_timeout_revert_message",
  "off_topic_message",
  "business_context",
  "flexible_scheduling",
  "closing_grace_minutes",
];

/** What `GET /businesses/me/config/` really returns: the whole config row. */
const FULL_ROW = {
  tone: "casual",
  welcome_message: "Hola",
  fallback_message: "",
  out_of_hours_message: "",
  out_of_hours_ack_message: "",
  human_handoff_message: "",
  handoff_waiting_ack_message: "",
  handoff_timeout_revert_message: "",
  off_topic_message: "",
  business_context: "Barbería",
  flexible_scheduling: true,
  closing_grace_minutes: 30,
  // …plus everything that decides how the assistant BEHAVES, which is Yitopro's.
  // (`settings` is gone for real: the backend dropped the column in businesses/0020.)
  llm_provider: "openai",
  llm_model: "gpt-4o-mini",
  identity_message: "Soy un asistente",
  payment_redirect_message: "",
  appointment_created_template: "{weekday} {date}",
  human_handoff_enabled: true,
  available_agents: ["scheduling"],
};

describe("business config api", () => {
  it("narrows the GET to the tenant's own voice, so a PATCH built from it cannot carry staff fields", async () => {
    // The type used to claim 10 fields while the endpoint returned ~25, and the settings
    // page sent back what it received — the server ignored the extras, so the guarantee
    // rested on the server's goodwill (review 2026-07-27).
    server.use(
      http.get(`${API}/businesses/me/config/`, () => HttpResponse.json(FULL_ROW)),
    );

    const config = await getBusinessConfig();

    expect(Object.keys(config).sort()).toEqual([...VOICE_KEYS].sort());
    expect(config).not.toHaveProperty("llm_model");
    expect(config).not.toHaveProperty("settings");
    expect(config).not.toHaveProperty("appointment_created_template");
    expect(config.business_context).toBe("Barbería");
    // The scheduling-policy pair travels through, typed, not stringified.
    expect(config.flexible_scheduling).toBe(true);
    expect(config.closing_grace_minutes).toBe(30);
  });

  it("defaults missing scheduling fields to false/0, never the empty string", async () => {
    // pickConfig's blanket `?? ""` default is right for messages and wrong for a
    // bool/int: "" typed as boolean survives by accident (falsy) and breaks a
    // number input. The per-field defaults map is what this pins.
    const {
      flexible_scheduling: _flex,
      closing_grace_minutes: _grace,
      ...withoutScheduling
    } = FULL_ROW;
    server.use(
      http.get(`${API}/businesses/me/config/`, () =>
        HttpResponse.json(withoutScheduling),
      ),
    );

    const config = await getBusinessConfig();

    expect(config.flexible_scheduling).toBe(false);
    expect(config.closing_grace_minutes).toBe(0);
  });

  it("narrows the PATCH response too (the page feeds it straight back into state)", async () => {
    let sent: unknown;
    server.use(
      http.patch(`${API}/businesses/me/config/`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(FULL_ROW);
      }),
    );

    const saved = await updateBusinessConfig({
      fallback_message: "Perdón, no entendí.",
    });

    expect(sent).toEqual({ fallback_message: "Perdón, no entendí." });
    expect(Object.keys(saved).sort()).toEqual([...VOICE_KEYS].sort());
  });

  it("defaults a missing tone instead of minting an invalid one", async () => {
    const { tone: _dropped, ...withoutTone } = FULL_ROW;
    server.use(
      http.get(`${API}/businesses/me/config/`, () => HttpResponse.json(withoutTone)),
    );

    expect((await getBusinessConfig()).tone).toBe("friendly");
  });
});

describe("businesses api", () => {
  it("getBusiness maps the WhatsApp connection fields from the backend", async () => {
    server.use(
      http.get(`${API}/businesses/me/`, () =>
        HttpResponse.json({
          id: 7,
          name: "Acme",
          country: "CL",
          address: "Av. Providencia 123",
          currency: "CLP",
          language: "es",
          timezone: "America/Santiago",
          active: true,
          is_operative: true,
          whatsapp_connected: true,
          whatsapp_number: "+56 9 1111 2222",
          onboarding_status: "completed",
          assistant_config: {
            display_name: "Maya",
            tone: "friendly",
            language: "es",
            welcome_message: "",
          },
        }),
      ),
    );
    const b = await getBusiness();
    expect(b.whatsapp_connected).toBe(true);
    expect(b.whatsapp_number).toBe("+56 9 1111 2222");
  });

  it("completeOnboarding returns ok on 200", async () => {
    server.use(
      http.post(`${API}/businesses/me/onboarding/complete/`, () =>
        HttpResponse.json({
          id: 1,
          name: "Acme",
          country: "CL",
          currency: "CLP",
          language: "es",
          timezone: "America/Santiago",
          active: true,
          onboarding_status: "completed",
          assistant_config: {},
        }),
      ),
    );
    expect(await completeOnboarding()).toEqual({ ok: true });
  });

  it("completeOnboarding returns missing_steps on 400", async () => {
    server.use(
      http.post(`${API}/businesses/me/onboarding/complete/`, () =>
        HttpResponse.json({ missing_steps: ["whatsapp"] }, { status: 400 }),
      ),
    );
    expect(await completeOnboarding()).toEqual({
      ok: false,
      missing_steps: ["whatsapp"],
    });
  });

  it("getBusinessSchedule GETs /businesses/me/schedule/ and normalizes HH:MM:SS → HH:MM", async () => {
    server.use(
      http.get(`${API}/businesses/me/schedule/`, () =>
        HttpResponse.json([
          { day_of_week: 1, start_time: "08:00:00", end_time: "17:00:00" },
        ]),
      ),
    );
    const windows = await getBusinessSchedule();
    expect(windows).toEqual([
      { day_of_week: 1, start_time: "08:00", end_time: "17:00" },
    ]);
  });

  it("getBusinessHours GETs /business-hours/ and normalizes HH:MM:SS → HH:MM", async () => {
    server.use(
      http.get(`${API}/businesses/me/business-hours/`, () =>
        HttpResponse.json([
          { day_of_week: 0, start_time: "09:00:00", end_time: "18:00:00" },
        ]),
      ),
    );
    const windows = await getBusinessHours();
    expect(windows).toEqual([
      { day_of_week: 0, start_time: "09:00", end_time: "18:00" },
    ]);
  });

  it("putBusinessHours PUTs the windows and returns the normalized saved windows", async () => {
    let body: unknown;
    server.use(
      http.put(`${API}/businesses/me/business-hours/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json([
          { day_of_week: 0, start_time: "09:00:00", end_time: "13:00:00" },
        ]);
      }),
    );
    const out = await putBusinessHours([
      { day_of_week: 0, start_time: "09:00", end_time: "13:00" },
    ]);
    expect(body).toEqual([{ day_of_week: 0, start_time: "09:00", end_time: "13:00" }]);
    expect(out).toEqual([{ day_of_week: 0, start_time: "09:00", end_time: "13:00" }]);
  });

  it("getScheduleBlocks maps int ids → string and null professional", async () => {
    server.use(
      http.get(`${API}/businesses/me/schedule-blocks/`, () =>
        HttpResponse.json([
          {
            id: 5,
            professional_id: null,
            professional_name: "",
            start_datetime: "2026-07-01T12:00:00Z",
            end_datetime: "2026-07-01T16:00:00Z",
            reason: "Feriado",
          },
          {
            id: 6,
            professional_id: 3,
            professional_name: "Ana",
            start_datetime: "2026-07-02T12:00:00Z",
            end_datetime: "2026-07-02T16:00:00Z",
            reason: "",
          },
        ]),
      ),
    );
    const blocks = await getScheduleBlocks();
    expect(blocks[0]).toMatchObject({
      id: "5",
      professional_id: null,
      professional_name: "",
    });
    expect(blocks[1]).toMatchObject({
      id: "6",
      professional_id: "3",
      professional_name: "Ana",
    });
  });

  it("createScheduleBlock sends professional_id as number (or null) and returns the mapped block", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/businesses/me/schedule-blocks/`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: 9,
            professional_id: 3,
            professional_name: "Ana",
            start_datetime: "2026-07-01T12:00:00Z",
            end_datetime: "2026-07-01T16:00:00Z",
            reason: "Vacaciones",
          },
          { status: 201 },
        );
      }),
    );
    const created = await createScheduleBlock({
      professional_id: "3",
      start_datetime: "2026-07-01T12:00:00Z",
      end_datetime: "2026-07-01T16:00:00Z",
      reason: "Vacaciones",
    });
    expect(body?.professional_id).toBe(3); // string id → number for the backend
    expect(created).toMatchObject({
      id: "9",
      professional_id: "3",
      reason: "Vacaciones",
    });
  });

  it("createScheduleBlock sends null professional_id for a business-wide block", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/businesses/me/schedule-blocks/`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: 1,
            professional_id: null,
            professional_name: "",
            start_datetime: "2026-07-01T12:00:00Z",
            end_datetime: "2026-07-01T16:00:00Z",
            reason: "",
          },
          { status: 201 },
        );
      }),
    );
    await createScheduleBlock({
      professional_id: null,
      start_datetime: "2026-07-01T12:00:00Z",
      end_datetime: "2026-07-01T16:00:00Z",
    });
    expect(body?.professional_id).toBeNull();
  });

  it("deleteScheduleBlock DELETEs the block by id", async () => {
    let hit = "";
    server.use(
      http.delete(`${API}/businesses/me/schedule-blocks/:id/`, ({ params }) => {
        hit = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await deleteScheduleBlock("42");
    expect(hit).toBe("42");
  });
});
