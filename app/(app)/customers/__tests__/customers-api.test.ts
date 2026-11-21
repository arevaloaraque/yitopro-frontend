/**
 * `searchCustomers`: cómo se traducen los filtros de la pantalla de clientes al
 * contrato de `GET /api/customers/`.
 *
 * Vive junto a la pantalla y no en `lib/api/__tests__/mappers.test.ts` porque lo
 * que prueba es exactamente la traducción que esa pantalla necesita: los días de
 * calendario que el operador elige en dos `<input type="date">` contra la ventana
 * SEMIABIERTA que el backend espera. El único sitio donde vive esa suma de un día
 * es `lib/api/customers.ts`, y este es el test que falla si alguien la mueve a un
 * componente.
 */
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { configureApiAuth } from "@/lib/api";
import { CUSTOMER_ORDERINGS, searchCustomers } from "@/lib/api/customers";
import { server } from "@/mocks/server";

const BASE = "http://localhost:8050/api";

/** Devuelve la query con la que se llamó al backend. */
function captureQuery(): { params: URLSearchParams } {
  const seen = { params: new URLSearchParams() };
  server.use(
    http.get(`${BASE}/customers/`, ({ request }) => {
      seen.params = new URL(request.url).searchParams;
      return HttpResponse.json({ items: [], count: 0 });
    }),
  );
  return seen;
}

beforeEach(() => configureApiAuth({ getAccessToken: () => "tok" }));

describe("searchCustomers — ventana de creación", () => {
  it("manda la cota superior como el día SIGUIENTE a medianoche", async () => {
    // `created_to` es EXCLUSIVO: pidiendo el 8 se perdía todo lo creado el 8, que
    // es justo el día que el operador acaba de elegir.
    const seen = captureQuery();
    await searchCustomers({ createdFrom: "2026-08-01", createdTo: "2026-08-08" });

    expect(Date.parse(seen.params.get("created_to")!)).toBe(
      Date.parse("2026-08-09T00:00:00"),
    );
  });

  it("interpreta los días en hora LOCAL, no UTC", async () => {
    // `new Date("2026-08-01")` a secas es medianoche UTC; al oeste de Greenwich eso
    // es el 31 de julio por la tarde, así que «desde el 1» arrastraba al mes
    // anterior.
    const seen = captureQuery();
    await searchCustomers({ createdFrom: "2026-08-01", createdTo: "2026-08-08" });

    expect(Date.parse(seen.params.get("created_from")!)).toBe(
      Date.parse("2026-08-01T00:00:00"),
    );
  });

  it("cada extremo puede ir solo", async () => {
    const seen = captureQuery();
    await searchCustomers({ createdFrom: "2026-08-01" });

    expect(seen.params.get("created_from")).not.toBeNull();
    expect(seen.params.get("created_to")).toBeNull();
  });

  it("un día imposible se descarta en vez de reventar la pantalla", async () => {
    // El valor viene de la URL y `toISOString()` de un `Invalid Date` LANZA: sin la
    // guarda, un `?from=lol` escrito a mano dejaba la lista en blanco.
    const seen = captureQuery();
    await expect(searchCustomers({ createdFrom: "lol" })).resolves.toMatchObject({
      count: 0,
    });
    expect(seen.params.get("created_from")).toBeNull();
  });
});

describe("searchCustomers — orden", () => {
  // Los seis valores comprobados contra el backend en vivo (`?ordering=` de
  // `GET /api/customers/`): cualquier otro responde 422, así que no se traducen ni
  // se normalizan aquí — viajan tal cual y la pantalla solo ofrece estos.
  it.each(CUSTOMER_ORDERINGS)("manda `%s` tal cual", async (ordering) => {
    const seen = captureQuery();
    await searchCustomers({ ordering });

    expect(seen.params.get("ordering")).toBe(ordering);
  });

  it("sin filtros no ensucia la query con parámetros vacíos", async () => {
    // Un `?ordering=&created_from=` es ruido que el backend tiene que descartar y
    // que enmascara en los logs qué se pidió de verdad.
    const seen = captureQuery();
    await searchCustomers();

    expect(seen.params.get("ordering")).toBeNull();
    expect(seen.params.get("created_from")).toBeNull();
    expect(seen.params.get("created_to")).toBeNull();
    expect(seen.params.get("search")).toBeNull();
  });
});
