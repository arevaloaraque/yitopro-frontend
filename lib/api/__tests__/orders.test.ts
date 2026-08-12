/**
 * `listOrders` contra la forma REAL de `GET /api/orders/`.
 *
 * Existe por un bloqueante: el backend paginó esa ruta (`@paginate`) y pasó a
 * responder `{items, count}`, pero el cliente seguía haciendo `res.map(...)`.
 * La pantalla de pedidos moría con «res.map is not a function» y el selector de
 * pedidos del diálogo de cobro se quedaba mudo — con `lint`, `typecheck`, `test`
 * y `build` los cuatro en verde, porque el genérico de `api.get` es una aserción
 * y los tests de componente mockean el módulo entero devolviendo un array plano.
 *
 * Por eso este test habla HTTP (MSW) en vez de mockear `listOrders`: es la única
 * capa donde la forma del sobre se puede desmentir.
 */
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { listOrders } from "@/lib/api/orders";
import { server } from "@/mocks/server";

const API = "http://localhost:8050/api";

const backendOrder = {
  id: 32,
  customer_id: 2,
  customer_name: "Pedro Martínez",
  customer_phone: "584140003344",
  customer_email: "",
  status: "draft",
  total: "14.00",
  created_by_ai: false,
  created_at: "2026-07-31T18:09:51.570Z",
  updated_at: "2026-07-31T18:09:51.577Z",
  items: [
    {
      id: 16,
      product_id: 2,
      product_name: "Alimento Gato Adulto 1.5kg",
      quantity: 1,
      unit_price: "14.00",
      subtotal: "14.00",
      product_price: "14.00",
      product_stock: 20,
    },
  ],
};

describe("orders api", () => {
  it("lee el sobre paginado {items, count}, no un array plano", async () => {
    server.use(
      http.get(`${API}/orders/`, () =>
        HttpResponse.json({ items: [backendOrder], count: 137 }),
      ),
    );

    const page = await listOrders();

    expect(page.items).toHaveLength(1);
    // El `count` se DEVUELVE, no se descarta: es el único número honesto que el
    // pie de la tabla puede imprimir. Antes se tiraba y la pantalla llamaba
    // «total» al tope de red que esta función se inventaba.
    expect(page.count).toBe(137);
    expect(page.items[0]).toMatchObject({
      id: "32",
      customer: "Pedro Martínez",
      customer_id: "2",
      status: "draft",
      total: 14,
    });
    // Los Decimal string del backend llegan como number al panel.
    expect(page.items[0].items[0]).toMatchObject({
      product_id: "2",
      unit_price: 14,
      subtotal: 14,
      product_stock: 20,
    });
  });

  it("manda limit explícito: el default del servidor es 100 y truncaría en silencio", async () => {
    let seen: URL | null = null;
    server.use(
      http.get(`${API}/orders/`, ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json({ items: [], count: 0 });
      }),
    );

    await listOrders();

    // Una página, no el tope de 500 que se puso como parche: la lista ahora pagina
    // de verdad y el pie dice cuántos hay en total.
    expect(seen!.searchParams.get("limit")).toBe("20");
    expect(seen!.searchParams.get("offset")).toBe("0");
  });

  it("pagina por limit/offset", async () => {
    let seen: URL | null = null;
    server.use(
      http.get(`${API}/orders/`, ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json({ items: [], count: 0 });
      }),
    );

    await listOrders(undefined, { limit: 50, offset: 40 });

    expect(seen!.searchParams.get("limit")).toBe("50");
    expect(seen!.searchParams.get("offset")).toBe("40");
  });

  it("propaga status y customer_id como filtros de la consulta", async () => {
    let seen: URL | null = null;
    server.use(
      http.get(`${API}/orders/`, ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json({ items: [], count: 0 });
      }),
    );

    await listOrders("draft", { customer_id: "2" });

    expect(seen!.searchParams.get("status")).toBe("draft");
    expect(seen!.searchParams.get("customer_id")).toBe("2");
  });
});
