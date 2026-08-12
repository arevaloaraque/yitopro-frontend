/**
 * `lib/api/reports.ts` contra la forma REAL de `/api/reports/`.
 *
 * Habla HTTP (MSW) en vez de mockear la capa: es la única forma de pinear el
 * contrato que importa aquí — los Decimales del backend viajan como STRING y
 * deben llegar como number al panel, y el CSV debe llegar como texto tal cual.
 */
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import {
  customRangeError,
  exportValueCsv,
  getValueSummary,
  MAX_RANGE_DAYS,
  reportWindow,
} from "@/lib/api/reports";
import { server } from "@/mocks/server";

const API = "http://localhost:8050/api";

const backendSummary = {
  core: {
    replies: { ai: 154, operator: 1 },
    handoffs: {
      total: 9,
      resolved: 9,
      by_trigger: { ai: 4, customer: 4, rule: 1, timeout: 0 },
    },
    response_time: { median_s: 6.1, p90_s: 14.2, n: 40, n_total: 45, cutoff_s: 300 },
    out_of_hours: { inbound_outside: 12, schedule_configured: true },
    ai_activity: { calls: 122, errors: 2 },
  },
  blocks: {
    appointments: { ai_active_count: 1, by_professional: null, by_service: null },
    orders: { ai_confirmed_count: 6 },
    products: null,
    customers: null,
    payments: {
      series: [
        { day: "2026-08-03", currency: "CLP", paid_amount: "5000.00", paid_count: 1 },
      ],
      totals: [{ currency: "CLP", paid_amount: "95000.00", paid_count: 8 }],
      previous: [{ currency: "CLP", paid_amount: "0.00", paid_count: 0 }],
      composition: [{ kind: "order", currency: "CLP", amount: "67000.00", count: 5 }],
      links: { created: 12, opened: 10, paid: 8 },
    },
  },
};

describe("reports api", () => {
  it("mapea los Decimal-string del backend a number en serie, totales, previous y composición", async () => {
    server.use(
      http.get(`${API}/reports/value-summary/`, () =>
        HttpResponse.json(backendSummary),
      ),
    );

    const summary = await getValueSummary({
      date_from: "2026-07-12",
      date_to: "2026-08-10",
      days: 30,
    });

    const payments = summary.blocks.payments;
    expect(payments).not.toBeNull();
    expect(payments!.series[0]).toMatchObject({ paid_amount: 5000, paid_count: 1 });
    expect(payments!.totals[0]).toMatchObject({ paid_amount: 95000, paid_count: 8 });
    expect(payments!.previous[0]).toMatchObject({ paid_amount: 0, paid_count: 0 });
    expect(payments!.composition[0]).toMatchObject({ amount: 67000, count: 5 });
    // Los enteros del núcleo viajan como number desde el backend: pasan tal cual.
    expect(summary.core.replies).toEqual({ ai: 154, operator: 1 });
    expect(summary.blocks.appointments).toEqual({
      ai_active_count: 1,
      by_professional: null,
      by_service: null,
    });
  });

  it("manda date_from/date_to obligatorios en la query", async () => {
    let seen: URL | null = null;
    server.use(
      http.get(`${API}/reports/value-summary/`, ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json(backendSummary);
      }),
    );

    await getValueSummary({ date_from: "2026-08-01", date_to: "2026-08-07", days: 7 });

    expect(seen!.searchParams.get("date_from")).toBe("2026-08-01");
    expect(seen!.searchParams.get("date_to")).toBe("2026-08-07");
    // Sin profesional el parámetro NO viaja: un `professional_id=` vacío no es
    // «todos», es un id que el backend tendría que interpretar.
    expect(seen!.searchParams.has("professional_id")).toBe(false);
  });

  it("manda professional_id solo cuando se pide", async () => {
    let seen: URL | null = null;
    server.use(
      http.get(`${API}/reports/value-summary/`, ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json(backendSummary);
      }),
    );

    await getValueSummary(
      { date_from: "2026-08-01", date_to: "2026-08-07", days: 7 },
      9,
    );

    expect(seen!.searchParams.get("professional_id")).toBe("9");
  });

  it("devuelve el CSV como string tal cual (parseBody no lo toca)", async () => {
    const csv =
      "fecha,estado,monto,moneda,cliente,vinculo\n2026-08-03,Pagado,5000,CLP,,\n";
    server.use(
      http.get(
        `${API}/reports/export.csv`,
        () =>
          new HttpResponse(csv, {
            headers: { "Content-Type": "text/csv; charset=utf-8" },
          }),
      ),
    );

    const text = await exportValueCsv({
      date_from: "2026-07-12",
      date_to: "2026-08-10",
      days: 30,
    });

    expect(typeof text).toBe("string");
    expect(text).toBe(csv);
  });
});

describe("reportWindow", () => {
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;

  it("«7» son los últimos 7 días inclusivos en día LOCAL, terminando hoy", () => {
    const w = reportWindow("7");
    const today = new Date();
    const expectedFrom = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    expectedFrom.setDate(expectedFrom.getDate() - 6);
    expect(w.date_to).toBe(ymd(today));
    expect(w.date_from).toBe(ymd(expectedFrom));
    expect(w.days).toBe(7);
  });

  it("todos los presets son ventanas ARRASTRADAS que terminan hoy", () => {
    for (const [period, days] of [
      ["7", 7],
      ["30", 30],
      ["90", 90],
    ] as const) {
      const w = reportWindow(period);
      const from = new Date();
      from.setDate(from.getDate() - (days - 1));
      expect([w.date_from, w.date_to, w.days]).toEqual([
        ymd(from),
        ymd(new Date()),
        days,
      ]);
    }
  });

  it("ningún camino puede pedir más de MAX_RANGE_DAYS", () => {
    // Ya no existe «desde el inicio»: era el único que podía llegar a 366 días
    // anclando en el alta del negocio, y esa es justo la consulta que el
    // endpoint no debe permitir. Ahora el techo es uno y vale para todos.
    const maxPreset = Math.max(
      ...(["7", "30", "90"] as const).map((p) => reportWindow(p).days),
    );
    expect(maxPreset).toBe(MAX_RANGE_DAYS);
    expect(customRangeError("2026-03-01", "2026-05-30")).toContain(
      String(MAX_RANGE_DAYS),
    );
    // Un rango inválido no inventa ventana: cae al preset más largo.
    expect(reportWindow("custom", { from: "2026-03-01", to: "2026-05-30" }).days).toBe(
      MAX_RANGE_DAYS,
    );
  });
});
