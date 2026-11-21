"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ReportWindow, ValueSummary } from "@/lib/api/reports";
import { prefersReducedMotion } from "@/lib/motion";
import { formatPrice } from "@/lib/utils";

type PaymentsBlockData = NonNullable<ValueSummary["blocks"]["payments"]>;

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Grano del eje temporal según el largo de la ventana. */
type Grain = "day" | "week" | "month";

/**
 * Grano del eje según la ventana — y la razón de que la LÍNEA valga aquí.
 *
 * Sobre la serie DIARIA una línea mentía: el cobro es un hecho discreto y el
 * backend omite los días sin ninguno, así que 121 días con 7 de cobro salían
 * como siete agujas sobre una recta en cero, y un negocio con un solo cobro,
 * como un pico entre 120 ceros. Esa era la forma de la rejilla, no del negocio.
 *
 * Agrupando por semana o por mes cada punto tiene valor propio y la continuidad
 * que la línea afirma es real: son períodos consecutivos comparables. Los
 * umbrales dejan siempre entre 5 y ~31 puntos —por debajo el gráfico no es un
 * gráfico, por encima no se lee— y el dibujo solo aparece con al menos dos
 * períodos con cobro.
 */
export function grainFor(days: number): Grain {
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

const GRAIN_NOUN: Record<Grain, string> = {
  day: "día",
  week: "semana",
  month: "mes",
};

/**
 * Ingresos cobrados por período, UN gráfico por moneda. Es el único componente
 * de la app que importa recharts, y la página lo carga con `next/dynamic`
 * (`ssr: false`): los +113 KB gzip de la librería los paga solo `/reports`.
 *
 * Nunca dos monedas sobre el mismo eje: un eje numérico no puede mezclar CLP
 * con USD.
 */
export default function RevenueChart({
  series,
  range,
}: {
  series: PaymentsBlockData["series"];
  range: ReportWindow;
}) {
  const grain = grainFor(range.days);
  const buckets = bucketGrid(range, grain);
  const still = prefersReducedMotion();

  // Un gráfico POR MONEDA, y solo para la que tenga al menos dos períodos con
  // cobro. Con uno solo no hay evolución: serían 200 px de eje para un valor
  // que el total de arriba ya da, y mejor. La decisión es por moneda y no por
  // la serie entera porque lo normal es que una tenga historia y la otra sea
  // un cobro suelto.
  const drawable = [...new Set(series.map((r) => r.currency))]
    .sort()
    .map((currency, i) => ({
      currency,
      rows: fold(series, currency, buckets, grain),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))
    .filter((c) => c.rows.filter((r) => r.amount > 0).length > 1);

  if (drawable.length === 0) return null;

  return (
    <div className={drawable.length > 1 ? "grid gap-5 md:grid-cols-2" : "space-y-5"}>
      {drawable.map(({ currency, rows, color }) => {
        const best = rows.reduce(
          (top, row, index) => (row.amount > (rows[top]?.amount ?? 0) ? index : top),
          0,
        );
        const hasMoney = rows[best]?.amount > 0;
        const config: ChartConfig = { amount: { label: currency, color } };
        return (
          <div key={currency}>
            {drawable.length > 1 ? (
              <p className="mb-1.5 text-[0.7rem] font-medium text-muted-foreground">
                {currency}
              </p>
            ) : null}
            {/* `accessibilityLayer` vuelve el SVG navegable por teclado, así
                que necesita nombre: sin él, con dos monedas son dos gráficos
                indistinguibles para un lector de pantalla.
                Alto FIJO y corto: la tarjeta ocupa el ancho completo de la
                grilla, así que la lectura la da el ancho, no el alto. */}
            <ChartContainer
              config={config}
              className="h-[168px] w-full"
              role="img"
              aria-label={`Cobros por ${GRAIN_NOUN[grain]} en ${currency}`}
            >
              <AreaChart
                accessibilityLayer
                data={rows}
                margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
              >
                <defs>
                  <linearGradient id={`fill-${currency}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                  tickMargin={8}
                />
                <YAxis
                  tickFormatter={formatCompact}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) =>
                        String(payload?.[0]?.payload?.full ?? "")
                      }
                      formatter={(value, _name, item) => {
                        // El monto solo no dice si fue un cobro grande o diez
                        // chicos; la fila ya trae el conteo.
                        const count = Number(item?.payload?.count ?? 0);
                        return `${formatPrice(Number(value), currency)} · ${count} ${count === 1 ? "cobro" : "cobros"}`;
                      }}
                    />
                  }
                />
                {/* recharts anima el trazado al montar por su cuenta y no
                    consulta la preferencia del sistema: el guard va aquí, no en
                    la hoja de estilos. */}
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="var(--color-amount)"
                  strokeWidth={2}
                  fill={`url(#fill-${currency})`}
                  isAnimationActive={!still}
                  activeDot={{ r: 4 }}
                  dot={(props) => {
                    // El mejor período va en `accent` y más grande. El color NO
                    // es el único portador: el pie lo nombra con fecha y monto.
                    const isBest = hasMoney && props.index === best;
                    return (
                      <circle
                        key={props.index}
                        cx={props.cx}
                        cy={props.cy}
                        r={isBest ? 4.5 : 2.5}
                        fill={isBest ? "var(--accent)" : "var(--color-amount)"}
                        stroke="var(--card)"
                        strokeWidth={isBest ? 2 : 0}
                      />
                    );
                  }}
                />
              </AreaChart>
            </ChartContainer>
            {hasMoney ? (
              <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
                Mejor {GRAIN_NOUN[grain]}: {rows[best].full} ·{" "}
                <span className="font-medium text-foreground">
                  {formatPrice(rows[best].amount, currency)}
                </span>{" "}
                ({rows[best].count} {rows[best].count === 1 ? "cobro" : "cobros"})
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

interface Bucket {
  key: string;
  label: string;
  full: string;
}

/** "2026-08-03" → Date LOCAL de ese día (no UTC: `new Date(iso)` lo correría). */
function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Inicio del bucket que contiene a `d`. La semana empieza en lunes. */
function startOf(d: Date, grain: Grain): Date {
  if (grain === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (grain === "week") {
    const weekday = (d.getDay() + 6) % 7; // 0 = lunes
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekday);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** El siguiente bucket. Se avanza por CAMPO de fecha, nunca sumando 86.400.000
 *  ms: en la noche del cambio de horario esos dos no son lo mismo y la rejilla
 *  saltaría o repetiría un día. */
function next(d: Date, grain: Grain): Date {
  if (grain === "month") return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + (grain === "week" ? 7 : 1),
  );
}

/** Todos los buckets de la ventana, incluidos los que no tienen ningún cobro:
 *  un hueco es un dato (no se cobró), y omitirlo comprime el tiempo. */
export function bucketGrid(range: ReportWindow, grain: Grain): Bucket[] {
  const last = parseYmd(range.date_to);
  let cursor = startOf(parseYmd(range.date_from), grain);
  const out: Bucket[] = [];
  while (cursor <= last) {
    out.push({
      key: ymd(cursor),
      label: shortLabel(cursor, grain),
      full: fullLabel(cursor, grain),
    });
    cursor = next(cursor, grain);
  }
  return out;
}

/** Suma la serie de UNA moneda dentro de los buckets. */
export function fold(
  series: PaymentsBlockData["series"],
  currency: string,
  buckets: Bucket[],
  grain: Grain,
) {
  const totals = new Map<string, { amount: number; count: number }>();
  for (const row of series) {
    if (row.currency !== currency) continue;
    const key = ymd(startOf(parseYmd(row.day), grain));
    const acc = totals.get(key) ?? { amount: 0, count: 0 };
    acc.amount += row.paid_amount;
    acc.count += row.paid_count;
    totals.set(key, acc);
  }
  return buckets.map((b) => ({
    ...b,
    ...(totals.get(b.key) ?? { amount: 0, count: 0 }),
  }));
}

function shortLabel(d: Date, grain: Grain): string {
  if (grain === "month") return d.toLocaleDateString("es-CL", { month: "short" });
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fullLabel(d: Date, grain: Grain): string {
  if (grain === "month") {
    return d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  }
  const day = d.toLocaleDateString("es-CL", { day: "numeric", month: "long" });
  if (grain === "week") return `Semana del ${day}`;
  return d.toLocaleDateString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

/**
 * Compacto propio y no `Intl` con `notation: "compact"`.
 *
 * En `es-CL` esa notación mezcla mayúscula y minúscula dentro de la MISMA
 * escala —medido: 3500 → «3,5 K», 7000 → «7 K», pero 14000 → «14 k» y 80000 →
 * «80 k»— porque el patrón compacto de CLDR cambia por tramo. Y redondea
 * 1.031.000 a «1 M», que en un eje de dinero borra treinta y un mil pesos.
 */
function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 2 })}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toLocaleString("es-CL", {
      maximumFractionDigits: abs >= 10_000 ? 0 : 1,
    })}k`;
  }
  return value.toLocaleString("es-CL");
}
