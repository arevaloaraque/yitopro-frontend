/**
 * `listServices()` — el catálogo completo que consumen los SELECTORES (diálogo de
 * citas, dashboard, wizard de onboarding). Ninguno de ellos pagina, así que lo
 * que esta función no traiga simplemente no existe para quien agenda: de ahí que
 * el caso interesante sea el catálogo que no cabe en una página (SVC-04).
 *
 * Vive junto a la pantalla de servicios porque `lib/api/__tests__/mappers.test.ts`
 * —su sitio natural, donde ya está el caso de una sola página— lo tenía tomado
 * otra tarea en paralelo. Moverlo allí es un `git mv`.
 */
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { listServices } from "@/lib/api/services";
import { server } from "@/mocks/server";

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/api`;

function backendService(id: number, name: string) {
  return {
    id,
    name,
    description: "",
    duration_minutes: 30,
    price: "10.00",
    active: true,
  };
}

describe("listServices — catálogo que no cabe en una página", () => {
  it("recorre las páginas hasta completar el count", async () => {
    // El backend recorta el `limit` pedido: la segunda vuelta tiene que salir del
    // offset real recibido, no de `página × limit`.
    const SERVER_CAP = 2;
    const all = [
      backendService(1, "Corte"),
      backendService(2, "Baño"),
      backendService(3, "Aseo"),
    ];
    const offsets: number[] = [];
    server.use(
      http.get(`${BASE}/services/`, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
        offsets.push(offset);
        return HttpResponse.json({
          items: all.slice(offset, offset + SERVER_CAP),
          count: all.length,
        });
      }),
    );

    const services = await listServices();

    expect(offsets).toEqual([0, 2]);
    // Alfabético: es lo que quieren los desplegables, aunque el backend devuelva
    // newest-first.
    expect(services.map((s) => s.name)).toEqual(["Aseo", "Baño", "Corte"]);
  });

  it("no se cuelga si el count no baja nunca", async () => {
    server.use(
      http.get(`${BASE}/services/`, () => HttpResponse.json({ items: [], count: 999 })),
    );

    await expect(listServices()).resolves.toEqual([]);
  });
});
