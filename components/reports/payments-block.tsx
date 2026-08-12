"use client";

import dynamic from "next/dynamic";
import { HandCoins, Link2, PieChart, TrendingDown, TrendingUp } from "lucide-react";

import { ReportCard } from "@/components/reports/report-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReportWindow, ValueSummary } from "@/lib/api/reports";
import { useDrawDonut, useGrowBars } from "@/lib/motion";
import { cn, formatPrice } from "@/lib/utils";

/**
 * Piso de la comparación contra el período anterior: con 1-2 cobros en la
 * ventana previa el porcentaje es ruido aritmético (un solo cobro da «+4.000%»),
 * así que debajo de este mínimo la tarjeta dice la verdad: no hay base.
 */
export const MIN_COMPARABLE_PAYMENTS = 3;

// Único consumidor de recharts de la app, cargado solo cuando /reports lo
// pinta: así el resto del panel no paga el peso de la librería de gráficos.
const RevenueChart = dynamic(() => import("./revenue-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-[200px] w-full rounded-xl" />,
});

type PaymentsBlockData = NonNullable<ValueSummary["blocks"]["payments"]>;

const KIND_LABELS: Record<PaymentsBlockData["composition"][number]["kind"], string> = {
  order: "Pedidos",
  appointment: "Citas",
  standalone: "Cobros sueltos",
};

/**
 * Color por CATEGORÍA, nunca por posición en el array.
 *
 * Asignarlo por índice hacía que «Cobros sueltos» saliera verde en el donut de
 * CLP —donde es el tercero— y morado en el de USD, donde es el único y por
 * tanto el índice 0. Dos ruedas contiguas, la misma categoría, dos colores: el
 * lector concluye que son cosas distintas.
 */
const KIND_COLORS: Record<PaymentsBlockData["composition"][number]["kind"], string> = {
  order: "var(--chart-1)",
  appointment: "var(--chart-2)",
  standalone: "var(--chart-3)",
};

/**
 * Cobros, en TRES tarjetas INDEPENDIENTES y no en una.
 *
 * Antes era una sola columna de casi mil píxeles —total, gráfico, gráfico,
 * donut, donut, enlaces— que obligaba a scrollear el bloque entero para llegar
 * a lo último. Y se exportan por separado, no como un fragmento, para que la
 * página pueda ORDENARLAS POR ALTURA junto al resto: agrupadas de tres en tres
 * forzaban a que una tarjeta de 235 px cayera al lado de una de 500, que es de
 * donde salían los 400 px de desnivel en una misma fila.
 *
 * La moneda NUNCA se suma entre sí: cada total, serie y porción va con su
 * propia `currency`.
 */
export function PaymentsMoneyCard({
  payments,
  range,
}: {
  payments: PaymentsBlockData;
  range: ReportWindow;
}) {
  const { series, totals, previous } = payments;

  return (
    /*
     * ANCHO COMPLETO, no dos de tres columnas.
     *
     * Con `col-span-2` la fila la definía su vecina y quedaban ~200 px de fondo
     * a la vista debajo; estirarla tapaba el hueco inflando el gráfico. A ancho
     * completo la fila es suya, el gráfico tiene el ancho que pide, y las seis
     * tarjetas restantes —todas de una columna— cierran DOS filas exactas de
     * tres, sin celdas huérfanas.
     */
    <ReportCard
      title="Cobros"
      subtitle="Dinero efectivamente cobrado en el período, agrupado por moneda."
      icon={HandCoins}
      className="lg:col-span-full"
    >
      {totals.length === 0 ? (
        <p className="text-[0.8rem] text-muted-foreground">
          Sin cobros en este período.
        </p>
      ) : (
        <div className="flex flex-1 flex-col gap-5">
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            {totals.map((t) => (
              <div key={t.currency}>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[1.75rem] leading-none font-semibold tracking-tight text-foreground tabular-nums">
                    {formatPrice(t.paid_amount, t.currency)}
                  </span>
                  <span className="text-[0.7rem] text-muted-foreground">
                    {t.paid_count} {t.paid_count === 1 ? "cobro" : "cobros"} ·{" "}
                    {t.currency}
                  </span>
                </div>
                <MomLine current={t} previous={previous} windowDays={range.days} />
              </div>
            ))}
          </div>
          {/* Quién se dibuja y quién no lo decide el gráfico, por moneda: una
              puede tener historia y la otra ser un cobro suelto. */}
          {series.length > 0 ? <RevenueChart series={series} range={range} /> : null}
        </div>
      )}
    </ReportCard>
  );
}

export function PaymentsCompositionCard({
  composition,
  animate,
}: {
  composition: PaymentsBlockData["composition"];
  animate: boolean;
}) {
  const ref = useDrawDonut<HTMLDivElement>(animate);
  if (composition.length === 0) return null;
  return (
    <ReportCard
      title="De dónde vino el dinero"
      subtitle="Reparto de lo cobrado según lo que pagaba cada cobro."
      icon={PieChart}
    >
      <div ref={ref}>
        <CompositionDonuts composition={composition} />
      </div>
    </ReportCard>
  );
}

export function PaymentsLinksCard({
  links,
  animate,
}: {
  links: PaymentsBlockData["links"];
  animate: boolean;
}) {
  return (
    <ReportCard
      title="Enlaces de cobro"
      subtitle="Cuántos enlaces enviaste y hasta dónde llegó cada uno."
      icon={Link2}
      link={{ href: "/payments", label: "Ver pagos" }}
    >
      <LinkFunnel links={links} animate={animate} />
    </ReportCard>
  );
}

/** 3 de 4 → "75%". El denominador nunca es cero acá: quien llama ya comprobó
 *  que hay enlaces creados. */
function pct(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

/**
 * El recorrido de un enlace: enviado → abierto → pagado.
 *
 * Tres barras proporcionales en vez de la frase que había. Es un embudo, y un
 * embudo se lee de un vistazo cuando cada paso ocupa el ancho que le toca; en
 * prosa hay que reconstruirlo mentalmente. Los números van en texto igual: la
 * barra acompaña al dato, no lo reemplaza.
 */
function LinkFunnel({
  links,
  animate,
}: {
  links: PaymentsBlockData["links"];
  animate: boolean;
}) {
  const ref = useGrowBars<HTMLUListElement>(animate);
  if (links.created === 0) {
    return (
      <p className="text-[0.8rem] text-muted-foreground">
        No enviaste enlaces de cobro en este período.
      </p>
    );
  }
  const steps = [
    {
      key: "created",
      label: "Enviados",
      n: links.created,
      tone: "bg-muted-foreground/40",
    },
    { key: "opened", label: "Abiertos", n: links.opened, tone: "bg-chart-4" },
    { key: "paid", label: "Pagados", n: links.paid, tone: "bg-success" },
  ];
  return (
    <ul ref={ref} className="space-y-3">
      {steps.map((step) => (
        <li key={step.key}>
          <div className="flex items-baseline justify-between gap-3 text-[0.8rem]">
            <span className="text-muted-foreground">{step.label}</span>
            <span className="font-medium text-foreground tabular-nums">
              {step.n}
              <span className="ml-1.5 text-[0.7rem] font-normal text-muted-foreground">
                {pct(step.n, links.created)}%
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              data-bar
              className={cn("h-full origin-left rounded-full", step.tone)}
              style={{ width: `${pct(step.n, links.created)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** La línea «vs el período anterior» de UNA moneda: con piso mínimo, y diciendo
 *  contra qué compara y con cuántos cobros. */
function MomLine({
  current,
  previous,
  windowDays,
}: {
  current: PaymentsBlockData["totals"][number];
  previous: PaymentsBlockData["previous"];
  windowDays: number;
}) {
  const prev = previous.find((p) => p.currency === current.currency);
  const prevCount = prev?.paid_count ?? 0;
  if (prevCount < MIN_COMPARABLE_PAYMENTS || !prev || prev.paid_amount <= 0) {
    return (
      <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
        Sin período comparable (base insuficiente: {prevCount}{" "}
        {prevCount === 1 ? "cobro" : "cobros"} en los {windowDays} días anteriores)
      </p>
    );
  }
  const change = Math.round(
    ((current.paid_amount - prev.paid_amount) / prev.paid_amount) * 100,
  );
  const up = change >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-muted-foreground">
      {/* El chip es la ÚNICA variación de la pantalla, y existe solo porque el
          backend manda una ventana previa comparable. La flecha acompaña al
          signo: el color no puede ser el único portador. */}
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold",
          up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
        )}
      >
        <Icon className="size-3" aria-hidden="true" />
        {up ? "+" : ""}
        {change}%
      </span>
      vs los {windowDays} días anteriores ({prev.paid_count}{" "}
      {prev.paid_count === 1 ? "cobro" : "cobros"})
    </p>
  );
}

/** Un donut por moneda — la composición mezcla montos y mezclar monedas en una
 *  sola rueda sería la misma mentira que sumarlas. */
function CompositionDonuts({
  composition,
}: {
  composition: PaymentsBlockData["composition"];
}) {
  const currencies = [...new Set(composition.map((r) => r.currency))].sort();
  return (
    <div className="space-y-5">
      {currencies.map((currency) => (
        <div key={currency}>
          {/* Con una sola moneda el rótulo sobra: el monto de cada porción ya
              la lleva. Con dos, dos ruedas idénticas necesitan decir cuál es
              cuál — mismo criterio que el gráfico de la serie. */}
          {currencies.length > 1 ? (
            <p className="mb-2 text-[0.7rem] font-medium text-muted-foreground">
              {currency}
            </p>
          ) : null}
          <Donut rows={composition.filter((r) => r.currency === currency)} />
        </div>
      ))}
    </div>
  );
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Donut({ rows }: { rows: PaymentsBlockData["composition"] }) {
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const slices = rows.map((r, i) => {
    const fraction = total > 0 ? r.amount / total : 0;
    return {
      ...r,
      fraction,
      offset: rows
        .slice(0, i)
        .reduce((sum, p) => sum + (total > 0 ? p.amount / total : 0), 0),
      color: KIND_COLORS[r.kind],
    };
  });

  return (
    <div className="space-y-3">
      {/* Una sola procedencia no necesita rueda: un círculo completo al 100% no
          compara nada con nada. Se dibuja solo el desglose. */}
      {slices.length > 1 ? (
        <svg
          viewBox="0 0 120 120"
          className="mx-auto size-[128px] shrink-0 -rotate-90"
          role="img"
          aria-label={`Reparto de lo cobrado en ${rows[0]?.currency ?? ""}`}
        >
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="16"
          />
          {slices.map((s) => (
            <circle
              key={s.kind}
              data-draw
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={`${s.fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              strokeDashoffset={-s.offset * CIRCUMFERENCE}
            />
          ))}
        </svg>
      ) : null}
      <ul className="space-y-2">
        {slices.map((s) => (
          <li key={s.kind} className="flex items-baseline gap-2 text-[0.8rem]">
            <span
              className="size-2.5 shrink-0 translate-y-[1px] rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {KIND_LABELS[s.kind]}
            </span>
            <span className="shrink-0 font-medium text-foreground tabular-nums">
              {formatPrice(s.amount, s.currency)}
            </span>
            {/* El porcentaje explícito es el respaldo del donut: quien no
                distinga los colores igual puede comparar las porciones. */}
            <span className="w-9 shrink-0 text-right text-[0.7rem] text-muted-foreground tabular-nums">
              {Math.round(s.fraction * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
