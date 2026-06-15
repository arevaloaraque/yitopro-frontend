import { http, HttpResponse } from "msw";

import type { Customer } from "@/lib/types";

import { BUSINESS_ID } from "../data/seed";
import { db, genId } from "../data/store";
import { API, notFound } from "./util";

export const customerHandlers = [
  http.get(`${API}/customers`, () => {
    return HttpResponse.json({ items: db.customers, count: db.customers.length });
  }),

  http.post(`${API}/customers`, async ({ request }) => {
    const input = (await request.json()) as Pick<Customer, "name" | "phone">;
    const customer: Customer = {
      id: genId("cus"),
      business_id: BUSINESS_ID,
      name: input.name,
      phone: input.phone,
      created_at: new Date().toISOString(),
    };
    db.customers.push(customer);
    return HttpResponse.json(customer, { status: 201 });
  }),

  http.get(`${API}/customers/:id`, ({ params }) => {
    const customer = db.customers.find((c) => c.id === params.id);
    if (!customer) return notFound();
    return HttpResponse.json(customer);
  }),
];
