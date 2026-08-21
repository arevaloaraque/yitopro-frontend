import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { configureApiAuth } from "@/lib/api";
import {
  cancelAppointment,
  createAppointment,
  getAppointmentHistory,
  listAppointments,
  rescheduleAppointment,
} from "@/lib/api/appointments";
import { listConversations, listMessages, sendMessage } from "@/lib/api/conversations";
import { createCustomer, getCustomer, updateCustomer } from "@/lib/api/customers";
import { createOrder, updateOrder } from "@/lib/api/orders";
import { createService, listServices, searchServices } from "@/lib/api/services";
import { server } from "@/mocks/server";

const BASE = "http://localhost:8050/api";

beforeEach(() => configureApiAuth({ getAccessToken: () => "tok" }));

describe("services mapper", () => {
  it("maps active->is_active, decimal-string price->number, id->string from the paginated envelope", async () => {
    server.use(
      http.get(`${BASE}/services/`, () =>
        HttpResponse.json({
          items: [
            {
              id: 1,
              name: "Baño",
              description: "",
              duration_minutes: 30,
              price: "20.00",
              active: true,
            },
          ],
          count: 1,
        }),
      ),
    );
    expect(await listServices()).toEqual([
      {
        id: "1",
        name: "Baño",
        description: "",
        duration_minutes: 30,
        price: 20,
        is_active: true,
      },
    ]);
  });

  it("searchServices returns the paginated envelope with mapped items", async () => {
    server.use(
      http.get(`${BASE}/services/`, () =>
        HttpResponse.json({
          items: [
            {
              id: 2,
              name: "Corte",
              description: "",
              duration_minutes: 45,
              price: "15000.00",
              active: true,
            },
          ],
          count: 7,
        }),
      ),
    );
    expect(await searchServices({ limit: 1, offset: 0 })).toEqual({
      items: [
        {
          id: "2",
          name: "Corte",
          description: "",
          duration_minutes: 45,
          price: 15000,
          is_active: true,
        },
      ],
      count: 7,
    });
  });

  it("create posts active + numeric price", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/services/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            id: 9,
            name: "X",
            description: "",
            duration_minutes: 10,
            price: "5.00",
            active: true,
          },
          { status: 201 },
        );
      }),
    );
    await createService({ name: "X", duration_minutes: 10, price: 5, is_active: true });
    expect(body).toMatchObject({
      name: "X",
      duration_minutes: 10,
      price: 5,
      active: true,
    });
  });
});

describe("customers mapper", () => {
  it("maps display_name->name and create posts {phone, display_name}", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/customers/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            id: 4,
            phone: "569",
            display_name: "Bob",
            email: "",
            created_at: "2026-06-01T00:00:00Z",
            rating_avg: null,
            rating_count: 0,
          },
          { status: 201 },
        );
      }),
    );
    const result = await createCustomer({ name: "Bob", phone: "569" });
    expect(body).toEqual({ phone: "569", display_name: "Bob" });
    expect(result.created).toBe(true);
    expect(result.customer).toMatchObject({ name: "Bob" });
  });

  it("updateCustomer PATCHes display_name/email and maps the response (incl. email)", async () => {
    let body: unknown;
    server.use(
      http.patch(`${BASE}/customers/9/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          id: 9,
          phone: "569",
          display_name: "Ana B",
          email: "ana@x.cl",
          created_at: "2026-06-01T00:00:00Z",
          rating_avg: null,
          rating_count: 0,
        });
      }),
    );
    const out = await updateCustomer("9", { name: "Ana B", email: "ana@x.cl" });
    expect(body).toEqual({ display_name: "Ana B", email: "ana@x.cl" });
    expect(out).toMatchObject({
      id: "9",
      name: "Ana B",
      phone: "569",
      email: "ana@x.cl",
    });
  });
});

describe("conversations mapper", () => {
  it("maps status + nested customer; sendMessage posts {content} as a human reply", async () => {
    server.use(
      // `/conversations/` pagina por CURSOR: `{items, next_cursor, has_more}` y
      // sin `count` (contar un recorte de la historia del tenant cuesta una
      // lectura completa por página, para un número sobre el que nadie actúa).
      http.get(`${BASE}/conversations/`, () =>
        HttpResponse.json({
          items: [
            {
              id: 1,
              status: "assigned_to_human",
              channel_type: "whatsapp",
              active_agent: "",
              customer: {
                id: 7,
                display_name: "Ana",
                phone: "569",
                rating_avg: 4.5,
                rating_count: 2,
              },
              assignee_id: 2,
              // DISTINTOS a propósito: si fueran iguales, un mapper que copiara
              // `last_message_at` en `created_at` pasaría el test igual.
              last_message_at: "2026-06-03T10:00:00Z",
              created_at: "2026-06-01T00:00:00Z",
              updated_at: "2026-06-05T23:00:00Z",
              customer_rating: 3,
              rating_status: "rated",
              last_message_preview: "hola, tienen hora?",
              last_message_direction: "in",
              last_message_sender_kind: "",
            },
          ],
          next_cursor: "",
          has_more: false,
        }),
      ),
    );
    expect((await listConversations()).items[0]).toMatchObject({
      id: "1",
      customer_id: "7",
      customer_name: "Ana",
      customer_phone: "569",
      status: "human_handoff",
      active_agent: null,
      assignee_id: "2",
      unread: 0,
      customer_rating: 3,
      rating_status: "rated",
      // El agregado del cliente viaja ANIDADO en `customer` y se aplana acá: si el mapper
      // leyera un `customer_rating_avg` plano (que el backend NO manda) esto lo caza.
      customer_rating_avg: 4.5,
      customer_rating_count: 2,
      last_message_preview: "hola, tienen hora?",
      last_message_direction: "in",
      last_message_sender_kind: "",
      last_message_at: "2026-06-03T10:00:00Z",
      // Lo usa el delimitador del hilo unificado («Conversación abierta el …»).
      created_at: "2026-06-01T00:00:00Z",
    });

    // `updated_at` NO se mapea, y la ausencia es la garantía: es «la última
    // escritura de la fila» sin nada que diga cuál fue, así que no se puede
    // rotular con honestidad — y no existe `closed_at`. Si alguien lo agrega
    // para pintar una hora de cierre, esto lo caza.
    expect((await listConversations()).items[0]).not.toHaveProperty("updated_at");

    let body: unknown;
    server.use(
      http.post(`${BASE}/conversations/1/messages/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            id: 50,
            direction: "out",
            content: "Hola",
            created_at: "2026-06-01T00:00:00Z",
          },
          { status: 201 },
        );
      }),
    );
    const msg = await sendMessage("1", "Hola");
    expect(body).toEqual({ content: "Hola" });
    expect(msg).toMatchObject({ direction: "outbound", sender: "human", text: "Hola" });
  });

  it("listMessages derives sender from sender_kind: operator->human, system->system, ai/''->ai/customer", async () => {
    server.use(
      // Los mensajes también llegan en sobre: `{items, has_more}`, donde
      // `has_more` significa «hay historia más vieja arriba».
      http.get(`${BASE}/conversations/1/messages/`, () =>
        HttpResponse.json({
          items: [
            {
              id: 1,
              direction: "in",
              sender_kind: "",
              content: "hola",
              created_at: "2026-06-01T00:00:00Z",
            },
            {
              id: 2,
              direction: "out",
              sender_kind: "operator",
              content: "hola humano",
              created_at: "2026-06-01T00:00:00Z",
            },
            {
              id: 3,
              direction: "out",
              sender_kind: "system",
              content: "recordatorio",
              created_at: "2026-06-01T00:00:00Z",
            },
            {
              id: 4,
              direction: "out",
              sender_kind: "ai",
              content: "hola IA",
              created_at: "2026-06-01T00:00:00Z",
            },
          ],
          has_more: false,
        }),
      ),
    );
    const messages = await listMessages("1");
    expect(messages.items.map((m) => m.sender)).toEqual([
      "customer",
      "human",
      "system",
      "ai",
    ]);
  });
});

describe("appointments mapper", () => {
  const appt = {
    id: 1,
    service_id: 2,
    professional_id: 3,
    customer_id: 4,
    customer_name: "Ana",
    start_datetime: "2026-06-29T09:00:00Z",
    end_datetime: "2026-06-29T09:30:00Z",
    status: "scheduled",
    origin: "admin",
    notes: "",
    cancellation_reason: "",
  };

  it("lee el sobre paginado {items, count} y mapea origin->created_by + start_datetime->start", async () => {
    server.use(
      http.get(`${BASE}/appointments/`, () =>
        HttpResponse.json({ items: [appt], count: 137 }),
      ),
    );
    const page = await listAppointments();
    // El `count` es del servidor: es lo único que sabe cuántas citas hay detrás
    // de la página que se está mostrando.
    expect(page.count).toBe(137);
    expect(page.items[0]).toMatchObject({
      id: "1",
      service_id: "2",
      professional_id: "3",
      customer_id: "4",
      customer_name: "Ana",
      start: "2026-06-29T09:00:00Z",
      created_by: "human",
      status: "scheduled",
    });
  });

  it("manda date_from/date_to de verdad, no un día suelto", async () => {
    let url = "";
    server.use(
      http.get(`${BASE}/appointments/`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ items: [appt], count: 1 });
      }),
    );
    // Antes el rango se colapsaba a `date=<día de from>` y `to` se tiraba en
    // silencio: pedir una semana devolvía un día y el calendario dibujaba la
    // semana con esa jornada.
    await listAppointments({ date_from: "2026-06-29", date_to: "2026-07-05" });
    expect(url).toContain("date_from=2026-06-29");
    expect(url).toContain("date_to=2026-07-05");
    expect(url).not.toContain("date=");
  });

  it("con `date` no manda el rango: el backend le da prioridad al día suelto", async () => {
    let url = "";
    server.use(
      http.get(`${BASE}/appointments/`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ items: [appt], count: 1 });
      }),
    );
    await listAppointments({
      date: "2026-06-29",
      date_from: "2026-06-01",
      date_to: "2026-06-30",
    });
    expect(url).toContain("date=2026-06-29");
    expect(url).not.toContain("date_from");
    expect(url).not.toContain("date_to");
  });

  it("list forwards professional_id, service_id, limit y offset como query params", async () => {
    let url = "";
    server.use(
      http.get(`${BASE}/appointments/`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ items: [appt], count: 1 });
      }),
    );
    await listAppointments({ professional_id: "3", service_id: "2", offset: 25 });
    expect(url).toContain("professional_id=3");
    expect(url).toContain("service_id=2");
    expect(url).toContain("offset=25");
    // `limit` viaja SIEMPRE, aunque quien llama no lo pase: el default del
    // servidor es 100 y un recorte callado se lee como una agenda completa.
    expect(url).toContain("limit=100");
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
    expect(createBody).toMatchObject({
      service_id: 2,
      customer_id: 4,
      start_datetime: "2026-06-29T09:00:00Z",
    });
    expect(createBody).not.toHaveProperty("end");

    await rescheduleAppointment("1", {
      start: "2026-06-30T10:00:00Z",
      end: "2026-06-30T10:30:00Z",
    });
    expect(reBody).toEqual({ new_start_datetime: "2026-06-30T10:00:00Z" });

    const cancelled = await cancelAppointment("1", "no show");
    expect(cancelBody).toEqual({ reason: "no show" });
    expect(cancelled.status).toBe("cancelled");
  });

  it("history maps event_type->event chronologically and drops unknown types", async () => {
    server.use(
      http.get(`${BASE}/appointments/7/history/`, () =>
        HttpResponse.json([
          {
            event_type: "appointment_created",
            created_at: "2026-07-01T09:00:00Z",
            metadata: {},
          },
          {
            event_type: "appointment_no_show",
            created_at: "2026-07-03T09:00:00Z",
            metadata: {},
          },
          {
            event_type: "something_unknown",
            created_at: "2026-07-04T09:00:00Z",
            metadata: {},
          },
        ]),
      ),
    );
    const history = await getAppointmentHistory("7");
    expect(history.map((h) => h.event)).toEqual(["created", "no_show"]);
    expect(history[0]).toMatchObject({
      appointment_id: "7",
      timestamp: "2026-07-01T09:00:00Z",
      details: null,
    });
  });
});

describe("orders mapper", () => {
  const backendOrder = {
    id: 5,
    customer_id: 4,
    customer_name: "Ana",
    status: "draft",
    total: "30.00",
    created_by_ai: false,
    created_at: "2026-07-01T00:00:00Z",
    items: [
      {
        id: 1,
        product_id: 9,
        product_name: "Croquetas",
        quantity: 2,
        unit_price: "15.00",
      },
    ],
  };

  it("createOrder posts {customer_id, items:[{product_id, quantity}]} and maps the response", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/orders/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(backendOrder, { status: 201 });
      }),
    );
    const out = await createOrder({
      customer_id: "4",
      items: [{ product_id: "9", quantity: 2 }],
    });
    expect(body).toEqual({ customer_id: 4, items: [{ product_id: 9, quantity: 2 }] });
    expect(out).toMatchObject({
      id: "5",
      customer: "Ana",
      total: 30,
      items: [
        { product_id: "9", product_name: "Croquetas", quantity: 2, unit_price: 15 },
      ],
    });
  });

  it("updateOrder PATCHes {items:[...]} only (the customer is fixed by the order)", async () => {
    let body: unknown;
    server.use(
      http.patch(`${BASE}/orders/5/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(backendOrder);
      }),
    );
    await updateOrder("5", [{ product_id: "9", quantity: 3 }]);
    expect(body).toEqual({ items: [{ product_id: 9, quantity: 3 }] });
  });
});

describe("rating fields that landed later than the rest of the schema", () => {
  it("a payload WITHOUT them reads as «no rating», never as a zero", async () => {
    // Un caché viejo, un mock, o un backend a medio desplegar. `?? null` / `?? ""` /
    // `?? 0` existen para que eso no se pinte como la peor calificación posible.
    server.use(
      http.get(`${BASE}/conversations/`, () =>
        HttpResponse.json({
          items: [
            {
              id: 5,
              status: "closed",
              channel_type: "whatsapp",
              active_agent: "",
              customer: { id: 7, display_name: "Ana", phone: "569" },
              assignee_id: null,
              last_message_at: "2026-06-01T00:00:00Z",
              created_at: "2026-06-01T00:00:00Z",
              updated_at: "2026-06-01T00:00:00Z",
            },
          ],
          next_cursor: "",
          has_more: false,
        }),
      ),
      http.get(`${BASE}/customers/8/`, () =>
        HttpResponse.json({
          id: 8,
          phone: "569",
          display_name: "Ana",
          email: "",
          created_at: "2026-06-01T00:00:00Z",
        }),
      ),
    );
    const conv = (await listConversations()).items[0];
    expect(conv.customer_rating).toBeNull();
    expect(conv.rating_status).toBe("");

    const cust = await getCustomer("8");
    expect(cust.rating_avg).toBeNull();
    expect(cust.rating_count).toBe(0);
  });

  it("sends customer_id on the wire when the drawer asks for one customer's history", async () => {
    let seen: string | null = null;
    server.use(
      http.get(`${BASE}/conversations/`, ({ request }) => {
        seen = new URL(request.url).searchParams.get("customer_id");
        return HttpResponse.json({ items: [], next_cursor: "", has_more: false });
      }),
    );
    await listConversations({ customerId: "42" });
    expect(seen).toBe("42");
  });
});
