import { http, HttpResponse } from "msw";

import type { Product } from "@/lib/types";

import { BUSINESS_ID } from "../data/seed";
import { db, genId } from "../data/store";
import { API, notFound } from "./util";

export const productHandlers = [
  http.get(`${API}/products`, () => {
    return HttpResponse.json({ items: db.products, count: db.products.length });
  }),

  http.post(`${API}/products`, async ({ request }) => {
    const input = (await request.json()) as Omit<Product, "id" | "business_id">;
    const product: Product = {
      id: genId("prod"),
      business_id: BUSINESS_ID,
      ...input,
    };
    db.products.push(product);
    return HttpResponse.json(product, { status: 201 });
  }),

  http.patch(`${API}/products/:id`, async ({ params, request }) => {
    const product = db.products.find((p) => p.id === params.id);
    if (!product) return notFound();
    const patch = (await request.json()) as Partial<Product>;
    Object.assign(product, patch);
    return HttpResponse.json(product);
  }),
];
