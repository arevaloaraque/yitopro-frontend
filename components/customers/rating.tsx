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

const SLOTS = [0, 1, 2, 3, 4];

/**
 * Las 5 estrellas, con la última rellenada en PROPORCIÓN.
 *
 * Dos decisiones que no son cosméticas:
 *
 * 1. **Relleno parcial, no redondeo.** El promedio del evaluador es fraccionario (4,5) y
 *    redondear a 5 estrellas exagera el juicio sobre una persona en la dirección que más
 *    daño hace. Se dibujan dos filas idénticas superpuestas y la de arriba se recorta al
 *    `value/5` — así media estrella es media estrella.
 * 2. **Sin `gap`.** Las estrellas van pegadas a propósito: cualquier separación entra en el
 *    ancho del recorte y la frontera del relleno deja de caer donde dice el número. El propio
 *    icono de lucide ya trae aire dentro de su viewBox.
 *
 * El número no desaparece, cambia de canal: vive en `aria-label` y en el `title`. Sustituir
 * un dígito legible por cinco iconos sin eso dejaría la calificación fuera del alcance de un
 * lector de pantalla.
 */
function Stars({
  value,
  label,
  starClass,
}: {
  value: number;
  label: string;
  starClass: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="relative inline-flex shrink-0" role="img" aria-label={label}>
      <span className="inline-flex" aria-hidden>
        {SLOTS.map((i) => (
          <Star key={i} className={cn(starClass, "shrink-0 text-muted-foreground/40")} />
        ))}
      </span>
      <span
        className="absolute inset-y-0 left-0 inline-flex overflow-hidden"
        style={{ width: `${pct}%` }}
        aria-hidden
      >
        {SLOTS.map((i) => (
          <Star key={i} className={cn(starClass, "shrink-0 fill-warning text-warning")} />
        ))}
      </span>
    </span>
  );
}

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
  const formatted = avg.toLocaleString("es-CL");
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs text-foreground", className)}
      title={`${PROVENANCE} Promedio de ${count} ${plural(count)}.`}
    >
      <Stars value={avg} label={`${formatted} de 5`} starClass="size-3.5" />
      {/* Un solo nodo de texto: interpolar por partes lo fragmenta y un lector de pantalla
          (o un test) lo recibe en pedazos. El «/ 5» se fue con el dígito: contarlo es para
          lo que están las cinco estrellas. */}
      {!compact && (
        <span className="text-muted-foreground">{`· ${count} ${plural(count)}`}</span>
      )}
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
      className={cn("inline-flex items-center text-[0.65rem] text-foreground", className)}
      title={`${PROVENANCE} Esta conversación: ${value} de 5.`}
    >
      <Stars value={value} label={`${value} de 5`} starClass="size-3" />
    </span>
  );
}
