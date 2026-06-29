import { ApiError } from "@/lib/api";

/**
 * Safe user-facing message derived from any error. NEVER exposes stack traces,
 * internal details, or technical backend messages: it maps by HTTP status code
 * to consistent Spanish copy.
 */
export function friendlyMessage(error: unknown): string {
  if (error instanceof ApiError) return messageForStatus(error.status);
  return "Algo salió mal. Inténtalo de nuevo.";
}

/** Consistent message per HTTP status code (shared by error pages and boundaries). */
export function messageForStatus(status: number): string {
  switch (status) {
    case 0:
      return "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
    case 400:
      return "Los datos enviados no son válidos. Revísalos e inténtalo de nuevo.";
    case 401:
      return "Tu sesión expiró. Inicia sesión nuevamente.";
    case 403:
      return "No tienes permiso para realizar esta acción.";
    case 404:
      return "No encontramos lo que buscabas.";
    case 409:
      return "Hay un conflicto con el estado actual. Actualiza la página e inténtalo de nuevo.";
    default:
      return status >= 500
        ? "El servidor tuvo un problema. Inténtalo más tarde."
        : "Algo salió mal. Inténtalo de nuevo.";
  }
}

/** Short title per status code (for the 401/403/404/500 status pages). */
export function titleForStatus(status: number): string {
  switch (status) {
    case 401:
      return "Sesión expirada";
    case 403:
      return "Acceso denegado";
    case 404:
      return "Página no encontrada";
    default:
      return status >= 500 ? "Error del servidor" : "Algo salió mal";
  }
}
