import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Displays of the behaviour rating the conversation evaluator produces
 * (`apps/ai/evaluator.py`), 1-5, over the customer's CLOSED conversations.
 *
 * Two rules these components exist to enforce:
 *
 * 1. **Direction.** The number rates the CUSTOMER, not the business. A bare "4,5" beside a
 *    person's name reads as their rating *of us*, which inverts the meaning — so every
 *    surface labels it and carries the provenance in `title`.
 * 2. **A missing rating is not a bad rating.** `rating_count === 0` (evaluator off, thread
 *    closed less than 24 h ago, nothing rateable) must read as "Sin calificar", never as a 0
 *    that looks like the worst possible score.
 *
 * Deliberately NOT colour-coded: red/green on a judgement of a person says considerably
 * more than the number does, and the operator can read a digit.
 */

/** «conversación» → «conversaciones»: el plural PIERDE el acento, así que no se puede
 * formar concatenando un sufijo (daba «2 conversaciónes»). */
const plural = (n: number) => (n === 1 ? "conversación" : "conversaciones");

const PROVENANCE =
  "Calificación del comportamiento del cliente (1 a 5), calculada automáticamente sobre sus conversaciones cerradas.";

export function CustomerRating({
  avg,
  count,
  compact = false,
  className,
}: {
  avg: number | null;
  count: number;
  /**
   * Drops the «· N conversaciones» tail, keeping it in the tooltip. For places that already
   * show a count of their own: on an inbox group header, «2 conversaciones» (threads in the
   * group) sitting next to «· 1 conversación» (threads behind the average) reads as a
   * contradiction — two different counts of the same word, inches apart.
   */
  compact?: boolean;
  className?: string;
}) {
  if (!count || avg === null) {
    return (
      <span
        className={cn("text-xs text-muted-foreground", className)}
        title={`${PROVENANCE} Todavía no tiene conversaciones calificadas.`}
      >
        Sin calificar
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs text-foreground", className)}
      title={`${PROVENANCE} Promedio de ${count} ${plural(count)}.`}
    >
      <Star className="size-3.5 shrink-0" aria-hidden />
      <span className="font-medium tabular-nums">{avg.toLocaleString("es-CL")}</span>
      {/* Un solo nodo de texto: interpolar por partes lo fragmenta y un lector de pantalla
          (o un test) lo recibe en pedazos. */}
      <span className="text-muted-foreground">
        {compact ? "/ 5" : `/ 5 · ${count} ${plural(count)}`}
      </span>
    </span>
  );
}

/** Why a single thread has no number — all four statuses mean "no score". */
const MISSING: Record<string, string> = {
  pending: "Sin calificar aún",
  skipped: "No calificable",
  failed: "No se pudo calificar",
};

export function ThreadRating({
  value,
  status,
  className,
}: {
  value: number | null;
  status: string;
  className?: string;
}) {
  if (value === null) {
    return (
      <span
        className={cn("text-[0.65rem] text-muted-foreground", className)}
        title={PROVENANCE}
      >
        {MISSING[status] ?? "Sin calificar"}
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-[0.65rem] text-foreground", className)}
      title={`${PROVENANCE} Esta conversación: ${value} de 5.`}
    >
      <Star className="size-3 shrink-0" aria-hidden />
      <span className="font-medium tabular-nums">{value}</span>
      <span className="text-muted-foreground">/5</span>
    </span>
  );
}
