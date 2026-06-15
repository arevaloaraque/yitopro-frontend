import { http, HttpResponse } from "msw";

import type { Service } from "@/lib/types";

import { BUSINESS_ID } from "../data/seed";
import { db, genId } from "../data/store";
import { API, notFound } from "./util";

export const serviceHandlers = [
  http.get(`${API}/services`, () => {
    return HttpResponse.json({ items: db.services, count: db.services.length });
  }),

  http.post(`${API}/services`, async ({ request }) => {
    const input = (await request.json()) as Omit<Service, "id" | "business_id">;
    const service: Service = {
      id: genId("svc"),
      business_id: BUSINESS_ID,
      ...input,
    };
    db.services.push(service);
    return HttpResponse.json(service, { status: 201 });
  }),

  http.patch(`${API}/services/:id`, async ({ params, request }) => {
    const service = db.services.find((s) => s.id === params.id);
    if (!service) return notFound();
    const patch = (await request.json()) as Partial<Service>;
    Object.assign(service, patch);
    return HttpResponse.json(service);
  }),
];
