import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { configureApiAuth } from "@/lib/api";
import {
  cancelAppointment,
  createAppointment,
  listAppointments,
  rescheduleAppointment,
} from "@/lib/api/appointments";
import { listConversations, sendMessage } from "@/lib/api/conversations";
import { createCustomer, listCustomers } from "@/lib/api/customers";
import { listProducts } from "@/lib/api/products";
import { createService, listServices } from "@/lib/api/services";
import { server } from "@/mocks/server";

const BASE = "http://localhost:8050/api";

beforeEach(() => configureApiAuth({ getAccessToken: () => "tok" }));

describe("services mapper", () => {
  it("maps active->is_active, decimal-string price->number, id->string from a bare array", async () => {
    server.use(
      http.get(`${BASE}/services/`, () =>
        HttpResponse.json([
          { id: 1, name: "Baño", description: "", duration_minutes: 30, price: "20.00", active: true },
        ]),
      ),
    );
    expect(await listServices()).toEqual([
      { id: "1", name: "Baño", duration_minutes: 30, price: 20, is_active: true },
    ]);
  });

  it("create posts active + numeric price", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/services/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { id: 9, name: "X", description: "", duration_minutes: 10, price: "5.00", active: true },
          { status: 201 },
        );
      }),
    );
    await createService({ name: "X", duration_minutes: 10, price: 5, is_active: true });
    expect(body).toMatchObject({ name: "X", duration_minutes: 10, price: 5, active: true });
  });
});

describe("products mapper", () => {
  it("maps whatsapp_enabled->sellable_via_whatsapp and active->is_active", async () => {
    server.use(
      http.get(`${BASE}/products/`, () =>
        HttpResponse.json([
          { id: 2, name: "Croqueta", description: "", price: "14.00", stock: 20, active: true, whatsapp_enabled: false, category_id: 1 },
        ]),
      ),
    );
    expect((await listProducts())[0]).toEqual({
      id: "2",
      name: "Croqueta",
      price: 14,
      stock: 20,
      sellable_via_whatsapp: false,
      is_active: true,
    });
  });
});

describe("customers mapper", () => {
  it("maps display_name->name and create posts {phone, display_name}", async () => {
    server.use(
      http.get(`${BASE}/customers/`, () =>
        HttpResponse.json([
          { id: 3, phone: "569", display_name: "Ana", email: "", created_at: "2026-06-01T00:00:00Z" },
        ]),
      ),
    );
    expect((await listCustomers())[0]).toMatchObject({ id: "3", name: "Ana", phone: "569" });

    let body: unknown;
    server.use(
      http.post(`${BASE}/customers/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { id: 4, phone: "569", display_name: "Bob", email: "", created_at: "2026-06-01T00:00:00Z" },
          { status: 201 },
        );
      }),
    );
    const created = await createCustomer({ name: "Bob", phone: "569" });
    expect(body).toEqual({ phone: "569", display_name: "Bob" });
    expect(created).toMatchObject({ name: "Bob" });
  });
});

describe("conversations mapper", () => {
  it("maps status + nested customer; sendMessage posts {content} as a human reply", async () => {
    server.use(
      http.get(`${BASE}/conversations/`, () =>
        HttpResponse.json([
          {
            id: 1,
            status: "assigned_to_human",
            channel_type: "whatsapp",
            active_agent: "",
            customer: { id: 7, display_name: "Ana", phone: "569" },
            assignee_id: 2,
            last_message_at: "2026-06-01T00:00:00Z",
            created_at: "2026-06-01T00:00:00Z",
            updated_at: "2026-06-01T00:00:00Z",
          },
        ]),
      ),
    );
    expect((await listConversations())[0]).toMatchObject({
      id: "1",
      customer_id: "7",
      status: "human_handoff",
      active_agent: null,
      unread: 0,
    });

    let body: unknown;
    server.use(
      http.post(`${BASE}/conversations/1/messages/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { id: 50, direction: "out", content: "Hola", created_at: "2026-06-01T00:00:00Z" },
          { status: 201 },
        );
      }),
    );
    const msg = await sendMessage("1", "Hola");
    expect(body).toEqual({ content: "Hola" });
    expect(msg).toMatchObject({ direction: "outbound", sender: "human", text: "Hola" });
  });
});

describe("appointments mapper", () => {
  const appt = {
    id: 1,
    service_id: 2,
    professional_id: 3,
    customer_id: 4,
    start_datetime: "2026-06-29T09:00:00Z",
    end_datetime: "2026-06-29T09:30:00Z",
    status: "scheduled",
    origin: "admin",
    notes: "",
    cancellation_reason: "",
  };

  it("list maps origin->created_by + start_datetime->start and filters by date", async () => {
    let url = "";
    server.use(
      http.get(`${BASE}/appointments/`, ({ request }) => {
        url = request.url;
        return HttpResponse.json([appt]);
      }),
    );
    const list = await listAppointments({ from: "2026-06-29T00:00:00.000Z", to: "2026-06-29T23:59:59Z" });
    expect(url).toContain("date=2026-06-29");
    expect(list[0]).toMatchObject({
      id: "1",
      service_id: "2",
      customer_id: "4",
      start: "2026-06-29T09:00:00Z",
      created_by: "human",
      status: "scheduled",
    });
  });

  it("create posts start_datetime (no end); reschedule posts new_start_datetime; cancel posts reason", async () => {
    let createBody: unknown;
    let reBody: unknown;
    let cancelBody: unknown;
    server.use(
      http.post(`${BASE}/appointments/`, async ({ request }) => {
        createBody = await request.json();
        return HttpResponse.json(appt, { status: 201 });
      }),
      http.patch(`${BASE}/appointments/1/reschedule/`, async ({ request }) => {
        reBody = await request.json();
        return HttpResponse.json(appt);
      }),
      http.patch(`${BASE}/appointments/1/cancel/`, async ({ request }) => {
        cancelBody = await request.json();
        return HttpResponse.json({ ...appt, status: "cancelled" });
      }),
    );
    await createAppointment({
      service_id: "2",
      customer_id: "4",
      start: "2026-06-29T09:00:00Z",
      end: "2026-06-29T09:30:00Z",
    });
    expect(createBody).toMatchObject({ service_id: 2, customer_id: 4, start_datetime: "2026-06-29T09:00:00Z" });
    expect(createBody).not.toHaveProperty("end");

    await rescheduleAppointment("1", { start: "2026-06-30T10:00:00Z", end: "2026-06-30T10:30:00Z" });
    expect(reBody).toEqual({ new_start_datetime: "2026-06-30T10:00:00Z" });

    const cancelled = await cancelAppointment("1", "no show");
    expect(cancelBody).toEqual({ reason: "no show" });
    expect(cancelled.status).toBe("cancelled");
  });
});
