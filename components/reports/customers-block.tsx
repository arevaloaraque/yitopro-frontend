"use client";

import { Smile, Star } from "lucide-react";

import { ReportCard } from "@/components/reports/report-card";
import type { ValueSummary } from "@/lib/api/reports";
import { useGrowBars } from "@/lib/motion";
import { cn } from "@/lib/utils";

type CustomersData = NonNullable<ValueSummary["blocks"]["customers"]>;

/**
 * Qué significa cada escalón, palabra por palabra igual que la rúbrica que usa
 * el evaluador (`apps/ai/evaluator.py`). Se muestran porque «2 estrellas» no
 * dice nada por sí solo, y porque son la única defensa contra leer la tarjeta
 * como una nota de satisfacción.
 */
const STEP_LABELS: Record<number, string> = {
  1: "Hostil o puro ruido",
  2: "Poco colaborativo",
  3: "Interacción normal",
  4: "Claro y colaborativo",
  5: "Excelente",
};

/** Del rojo al verde: la escala tiene dirección y el color la acompaña. */
const STEP_BARS: Record<number, string> = {
  1: "bg-destructive",
  2: "bg-warning",
  3: "bg-chart-4",
  4: "bg-chart-3",
  5: "bg-success",
};

/**
 * Cómo se comportaron los clientes.
 *
 * **Mide la CONDUCTA DEL CLIENTE, no la satisfacción con el negocio.** El
 * evaluador puntúa cada conversación cerrada del 1 (hostil o puro ruido) al 5
 * (claro, respetuoso y al objetivo) y tiene prohibido juzgar al negocio o al
 * asistente. De ahí el título y el subtítulo: un promedio de 2,3 significa que
 * llegan clientes difíciles, y presentarlo como «calificación» a secas lo haría
 * leer como un servicio malo — exactamente lo contrario del dato.
 *
 * `null` en el backend = ninguna conversación calificada nunca: no se dibuja.
 */
export function CustomersBlock({
  customers,
  animate,
}: {
  customers: CustomersData;
  animate: boolean;
}) {
  const { average, rated, pending, distribution } = customers;
  const ref = useGrowBars<HTMLUListElement>(animate);
  const peak = Math.max(1, ...distribution.map((d) => d.conversations));

  return (
    <ReportCard
      title="Cómo te escriben tus clientes"
      subtitle="Del 1 al 5, cómo trató el cliente en cada conversación cerrada. No mide tu servicio."
      icon={Smile}
      link={{ href: "/conversations", label: "Ver conversaciones" }}
    >
      {rated === 0 ? (
        <p className="text-[0.8rem] text-muted-foreground">
          Ninguna conversación de este período tiene nota todavía
          {pending > 0
            ? `: ${pending} ${pending === 1 ? "está" : "están"} en espera de evaluación.`
            : "."}
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[1.75rem] leading-none font-semibold tracking-tight text-foreground tabular-nums">
              {average?.toLocaleString("es-CL", { minimumFractionDigits: 1 })}
            </span>
            <Stars value={average ?? 0} />
            <span className="text-[0.7rem] text-muted-foreground">de 5</span>
          </div>
          <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
            sobre {rated} {rated === 1 ? "conversación" : "conversaciones"} con nota
            {pending > 0 ? ` · ${pending} en espera` : ""}
          </p>

          {/* Los cinco escalones siempre, también los que valen cero: la FORMA es
              el dato — cinco «normales» y un «hostil» no es lo mismo que seis
              repartidos. */}
          <ul ref={ref} className="mt-4 space-y-2">
            {[...distribution].reverse().map((step) => (
              <li key={step.stars} className="flex items-center gap-2.5">
                <span className="flex w-14 shrink-0 items-center gap-1 text-[0.7rem] text-muted-foreground tabular-nums">
                  {step.stars}
                  <Star className="size-3 fill-current" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      data-bar
                      className={cn(
                        "block h-full origin-left rounded-full",
                        STEP_BARS[step.stars],
                      )}
                      style={{ width: `${(step.conversations / peak) * 100}%` }}
                    />
                  </span>
                  <span className="mt-1 block text-[0.7rem] text-muted-foreground">
                    {STEP_LABELS[step.stars]}
                  </span>
                </span>
                <span className="w-6 shrink-0 text-right text-[0.8rem] font-medium text-foreground tabular-nums">
                  {step.conversations}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ReportCard>
  );
}

/** Cinco estrellas con relleno proporcional. El número va al lado en texto: las
 *  estrellas ilustran, no informan por su cuenta. */
function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((step) => {
        const fill = Math.min(1, Math.max(0, value - step + 1));
        return (
          <span key={step} className="relative inline-block">
            <Star className="size-3.5 text-muted-foreground/30" />
            {fill > 0 ? (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star className="size-3.5 fill-warning text-warning" />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
