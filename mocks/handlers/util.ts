import { HttpResponse } from "msw";

import { API_BASE_URL } from "@/lib/api/client";

/**
 * Base que interceptan los handlers. DEBE coincidir con la URL que arma
 * `lib/api/client` (`API_BASE_URL` + `/api`), para que conectar el backend
 * real sea solo apagar MSW.
 */
export const API = `${API_BASE_URL}/api`;

/** Respuesta 404 estándar. */
export function notFound(detail = "No encontrado") {
  return HttpResponse.json({ detail }, { status: 404 });
}

/** Respuesta 400 estándar. */
export function badRequest(detail = "Petición inválida") {
  return HttpResponse.json({ detail }, { status: 400 });
}
