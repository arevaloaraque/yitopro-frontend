import { http, HttpResponse } from "msw";

import type { RecordValue } from "@/lib/types";

import { db } from "../data/store";
import { API, notFound } from "./util";

export const recordHandlers = [
  http.get(`${API}/customers/:id/record`, ({ params }) => {
    const record = db.records.find((r) => r.customer_id === params.id);
    if (!record) return notFound("Ficha no encontrada");
    return HttpResponse.json(record);
  }),

  http.patch(`${API}/customers/:id/record`, async ({ params, request }) => {
    const record = db.records.find((r) => r.customer_id === params.id);
    if (!record) return notFound("Ficha no encontrada");

    const body = (await request.json()) as {
      values: { [field: string]: RecordValue };
    };
    const now = new Date().toISOString();

    for (const [field, newValue] of Object.entries(body.values)) {
      const oldValue = record.values[field] ?? null;
      if (oldValue === newValue) continue;
      record.values[field] = newValue;
      // El cambio desde el panel lo origina un humano.
      record.audit.unshift({
        field,
        old_value: oldValue,
        new_value: newValue,
        changed_by: "human",
        changed_at: now,
      });
    }
    record.updated_at = now;

    return HttpResponse.json(record);
  }),
];
