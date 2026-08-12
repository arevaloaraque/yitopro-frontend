import type { Paginated, Service } from "@/lib/types";

import { api } from "./client";

/**
 * Actual backend shape (Django Ninja `ServiceOut`). It differs from the UI
 * type: `id` is an integer, `active` (not `is_active`), `price` is a Decimal
 * serialized as a string, and it does not include `business_id` (handled via
 * tenant scope). The mapping lives here so components consume `Service`
 * unchanged.
 */
interface BackendService {
  id: number;
  name: string;
  description: string;
  duration_minutes: number;
  price: string;
  active: boolean;
}

interface Page {
  items: BackendService[];
  count: number;
}

function fromBackend(s: BackendService): Service {
  return {
    id: String(s.id),
    name: s.name,
    description: s.description,
    duration_minutes: s.duration_minutes,
    price: Number(s.price),
    is_active: s.active,
  };
}

/** Página del catálogo completo. Alta a propósito: un catálogo normal entra en una sola. */
const FULL_PAGE_SIZE = 1000;
/** Tope de vueltas (10.000 servicios). Es el freno si el `count` del servidor no baja. */
const FULL_MAX_PAGES = 10;

/**
 * All services (for consumers that expect the full list: appointment/booking
 * dropdowns, dashboard, onboarding). The Services table uses the paginated
 * `searchServices` instead.
 *
 * Recorre las páginas hasta completar `count` en vez de pedir 1000 y tirar el
 * `count` a la basura (SVC-04). Sus consumidores son SELECTORES —el diálogo de
 * citas, el dashboard, el wizard de onboarding— y ninguno puede paginar dentro
 * de un `<Select>`: con un catálogo más largo que la página, el servicio que
 * sobraba no se recortaba con un aviso, simplemente **no existía** para quien
 * agenda. Paginar aquí lo arregla para los tres a la vez y deja la firma
 * intacta, así que ningún consumidor tiene que enterarse.
 *
 * El offset se calcula sobre lo ya recibido, no sobre `página × 1000`: así sigue
 * siendo correcto si el backend recorta el `limit` por su cuenta (el tope de
 * `@paginate` no está fijado en el repo del backend).
 *
 * NO recibe el `active` que el backend acaba de habilitar: ninguno de sus tres
 * consumidores lo pide, y mandar `active=true` por iniciativa propia cambiaría
 * qué ofrecen los selectores —el diálogo de citas dejaría de poder reagendar una
 * cita cuyo servicio se desactivó ayer—. Si algún día hace falta, el bucle sigue
 * valiendo: el `count` que reconcilia es el de ESA consulta, así que paginar un
 * catálogo filtrado funciona igual.
 */
export async function listServices(): Promise<Service[]> {
  const items: BackendService[] = [];
  let count = 0;
  for (let page = 0; page < FULL_MAX_PAGES; page += 1) {
    const res = await api.get<Page>("/services/", {
      query: { limit: FULL_PAGE_SIZE, offset: items.length },
    });
    count = res.count;
    items.push(...res.items);
    // La segunda guarda corta una página vacía con `count` alto: sin ella serían
    // diez peticiones idénticas al mismo offset.
    if (items.length >= count || res.items.length === 0) break;
  }
  if (items.length < count) {
    // Un `<Select>` no tiene a dónde escalar esto, pero un truncamiento que deja
    // rastro es investigable; el silencioso hacía que el servicio ausente
    // pareciera no existir.
    console.warn(
      `listServices: catálogo truncado en ${items.length} de ${count} servicios; los que faltan no aparecerán en los selectores.`,
    );
  }
  // Backend now returns newest-first (so new services show on page 1 of the paginated
  // table); dropdowns/onboarding want alphabetical, so re-sort here.
  return items.map(fromBackend).sort((a, b) => a.name.localeCompare(b.name));
}

interface ServiceSearchParams {
  search?: string;
  limit?: number;
  offset?: number;
  /**
   * Filtra por activo/inactivo, misma semántica que en productos: omitirlo trae
   * los dos. Habilitado por el backend recién ahora; `listServices()` NO lo usa a
   * propósito (ver su comentario).
   */
  active?: boolean;
}

/** Server-side search/pagination (Services table). */
export async function searchServices(
  params: ServiceSearchParams = {},
): Promise<Paginated<Service>> {
  const res = await api.get<Page>("/services/", {
    query: {
      search: params.search,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      active: params.active,
    },
  });
  return { items: res.items.map(fromBackend), count: res.count };
}

export type CreateServiceInput = Omit<Service, "id" | "business_id">;

export function createService(input: CreateServiceInput): Promise<Service> {
  return api
    .post<BackendService>("/services/", {
      name: input.name,
      description: input.description ?? "",
      duration_minutes: input.duration_minutes,
      price: input.price,
      active: input.is_active,
    })
    .then(fromBackend);
}

export function updateService(
  id: string,
  patch: Partial<Omit<Service, "id" | "business_id">>,
): Promise<Service> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.duration_minutes !== undefined)
    body.duration_minutes = patch.duration_minutes;
  if (patch.price !== undefined) body.price = patch.price;
  if (patch.is_active !== undefined) body.active = patch.is_active;
  return api.patch<BackendService>(`/services/${id}/`, body).then(fromBackend);
}

export function deleteService(id: string): Promise<void> {
  return api.delete<void>(`/services/${id}/`);
}
