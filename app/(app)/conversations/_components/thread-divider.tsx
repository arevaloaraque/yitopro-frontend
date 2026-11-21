"use client";

import { Button } from "@/components/ui/button";
import { ThreadRating } from "@/components/customers/rating";
import { formatDateTime } from "@/lib/format/date";
import type { ThreadSegment } from "@/lib/conversations/thread";

/**
 * El delimitador entre dos conversaciones del mismo número.
 *
 * ## Qué puede afirmar, y qué no
 *
 * Se ancla **estructuralmente** —va entre el último mensaje de una conversación y
 * lo que sigue— y **no imprime hora de cierre**: no existe `closed_at` en el
 * backend, y `updated_at` es «la última escritura de la fila» sin ningún campo que
 * diga cuál fue (el cierre, un `take`, una reapertura tibia). Por eso el tipo
 * `Conversation` no lo trae: si no está, nadie lo pinta por descuido.
 *
 * Sí se afirma, porque son hechos: el ESTADO (leído del campo vivo, que el SSE
 * puede cambiar mientras se mira), el ÚLTIMO MENSAJE (`last_message_at`, que
 * mantiene `Message.save()`) y la CALIFICACIÓN.
 *
 * Tampoco se dice **por qué** cerró: `conversacion_cerrada` trae `reason` pero
 * solo en vivo, no se persiste — un delimitador que lo mostrara diría una cosa
 * antes del F5 y otra después.
 *
 * La calificación reusa `ThreadRating` verbatim, que ya resuelve los tres «no hay
 * número» y ya lleva en su `title` que la nota mide **conducta del cliente**, no
 * satisfacción con el negocio. Rotularla «calificación del servicio» invertiría el
 * dato.
 *
 * Es un `<h3>`, no un adorno: en un hilo arbitrariamente largo estos son los
 * únicos puntos de navegación por conversación que tiene un lector de pantalla.
 */
export function ThreadDivider({ seg, current }: { seg: ThreadSegment; current: boolean }) {
  const estado =
    seg.conv.status === "closed"
      ? "Conversación cerrada"
      : seg.conv.status === "human_handoff"
        ? "En manos de un operador"
        : "Conversación en curso · IA";

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2" aria-hidden>
        <span className="h-px flex-1 bg-border/60" />
        <span className="h-px flex-1 bg-border/60" />
      </div>
      <div className="-mt-2 flex flex-col items-center gap-1">
        <h3 className="rounded-full border border-border/60 bg-background px-3 py-1 text-[0.7rem] font-medium text-muted-foreground">
          {estado}
          {current ? " · actual" : ""}
        </h3>
        <p className="text-[0.65rem] text-muted-foreground/80">
          Último mensaje: {formatDateTime(seg.conv.last_message_at)}
        </p>
        <ThreadRating value={seg.conv.customer_rating} status={seg.conv.rating_status} />
      </div>
    </div>
  );
}

/**
 * Un agujero DENTRO de la región cargada.
 *
 * Aparece cuando se llegó por un salto de fecha y todavía falta empalmar con lo
 * que está debajo: la API no tiene `after=`, así que el hueco se rellena de abajo
 * hacia arriba y mientras tanto se dibuja. Un scroll que teletransporta sin avisar
 * es peor que una espera visible.
 */
export function ThreadGap({
  seg,
  loading,
  onLoad,
}: {
  seg: ThreadSegment;
  loading: boolean;
  onLoad: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-5 py-4">
      <p className="text-[0.7rem] text-muted-foreground">
        Falta el tramo de la conversación del {formatDateTime(seg.conv.created_at)}
      </p>
      <Button variant="outline" size="xs" onClick={onLoad} disabled={loading}>
        {loading ? "Cargando…" : "Cargar lo que falta"}
      </Button>
    </div>
  );
}
