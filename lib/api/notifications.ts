import { api } from "./client";

import { mapSseEnvelope } from "@/lib/sse";
import type { SSEEvent, SSEEventType } from "@/lib/types";

/** Fila persistida: espejo del sobre del stream (`{event, data}`) más el id y
 * el timestamp REALES del backend — a diferencia del stream, donde ambos se
 * sintetizan en el cliente. Sin título/tono: la presentación vive en
 * `toNotification` y duplicarla en el backend desincronizaría los textos. */
interface RecentNotificationItem {
  id: string;
  event: SSEEventType;
  emitted_at: string;
  data: Record<string, unknown>;
}

/**
 * Últimos eventos notificables (hasta 30, recientes primero) para sembrar la
 * campana tras un reload: `GET /api/notifications/recent/`.
 *
 * El endpoint es NUEVO en el backend; mientras no exista, esto lanza (404) y el
 * caller degrada en silencio al comportamiento de siempre (campana en memoria).
 * Reusa `mapSseEnvelope` para la misma coerción que el stream (ids numéricos a
 * string, `start_datetime`→`start`) y luego impone id/emitted_at persistidos.
 */
export async function getRecentNotifications(): Promise<SSEEvent[]> {
  const res = await api.get<{ items: RecentNotificationItem[] }>(
    "/notifications/recent/",
  );
  return res.items.flatMap((it) => {
    const ev = mapSseEnvelope({ event: it.event, data: it.data });
    return ev ? [{ ...ev, id: it.id, emitted_at: it.emitted_at }] : [];
  });
}
