"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareDashed, Sparkles } from "lucide-react";

import { AppointmentsBlock } from "@/components/reports/appointments-block";
import { CoreStrip } from "@/components/reports/core-strip";
import { CsvExportButton } from "@/components/reports/csv-export-button";
import { OrdersBlock } from "@/components/reports/orders-block";
import { CustomersBlock } from "@/components/reports/customers-block";
import {
  PaymentsCompositionCard,
  PaymentsLinksCard,
  PaymentsMoneyCard,
} from "@/components/reports/payments-block";
import { ProductsBlock } from "@/components/reports/products-block";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import {
  customRangeError,
  daysSinceSignup,
  MAX_RANGE_DAYS,
  getValueSummary,
  reportWindow,
  todayISO,
  type ReportPeriod,
  type ValueSummary,
} from "@/lib/api/reports";
import { useAuth } from "@/lib/auth";
import { useBusiness } from "@/lib/business";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { cn } from "@/lib/utils";
import { useAmbient, useHoverLift, useReveal } from "@/lib/motion";

type PageState = "loading" | "error" | "ready";

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "custom", label: "Rango personalizado" },
];

/** Los filtros viven en la URL (`?p=` período, `?prof=` profesional): una vista
 *  se comparte y sobrevive un reload.
 *
 *  El default es el preset MÁS LARGO que se permite. Antes era «desde el inicio»
 *  justamente porque los presets cortos están vacíos el primer mes de un negocio;
 *  al desaparecer ese preset, 90 días es lo que conserva esa intención sin pedirle
 *  al backend una ventana que ya no acepta. */
const DEFAULT_FILTERS = { p: "90", prof: "", from: "", to: "" };

/** Cuánto dura la entrada antes de darse por terminada: el count-up (900 ms) es
 *  lo más largo, más el escalonado de las tarjetas. */
const ENTRANCE_MS = 1400;

function ReportsPageContent() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    business,
    state: bizState,
    error: bizError,
    refetch: refetchBusiness,
  } = useBusiness();
  const [f, setFilters] = useUrlFilters(DEFAULT_FILTERS);

  // Un `p` inventado a mano en la URL no llega al backend: cae al default.
  const period = (
    PERIODS.some((p) => p.value === f.p) ? f.p : DEFAULT_FILTERS.p
  ) as ReportPeriod;

  // Guard de ruta: solo una sesión staff CONFIRMADA sale de aquí. Con el rol
  // ausente (el fallback sin rol del login) NO se redirige — el backend
  // contesta 403 si corresponde y se muestra el error real, en vez de esconder
  // la sección al dueño de forma intermitente.
  const isStaff = user?.role === "staff";
  useEffect(() => {
    if (isStaff) router.replace("/dashboard");
  }, [isStaff, router]);

  // `prof` acota solo el bloque de agenda. Un valor no numérico en la URL se
  // ignora en vez de viajar al backend.
  const professionalId = /^\d+$/.test(f.prof) ? Number(f.prof) : undefined;

  // El rango personalizado también vive en la URL, así que una vista con fechas
  // a mano se comparte y sobrevive un reload igual que un preset.
  const isCustom = period === "custom";
  const rangeError = isCustom ? customRangeError(f.from, f.to) : "";

  // `reportRange` y no `window`: dentro de un componente `window` sombrea el
  // global del navegador, y el que lo lea después no sabe cuál está usando.
  //
  // Un par de fechas a medio escribir NO dispara petición: `reportWindow` cae a
  // «desde el inicio» y el efecto de carga se salta mientras haya `rangeError`,
  // así que en pantalla se queda la última ventana buena en vez de parpadear
  // contra un 400.
  const reportRange = useMemo(
    () => reportWindow(period, { from: f.from, to: f.to }),
    [period, f.from, f.to],
  );

  const [state, setState] = useState<PageState>("loading");
  const [data, setData] = useState<ValueSummary | null>(null);
  const [error, setError] = useState<{ message: string; status: number | null } | null>(
    null,
  );
  /** Hay una carga en vuelo con datos ya en pantalla (refetch por filtro). */
  const [busy, setBusy] = useState(false);

  /**
   * La coreografía de entrada corre UNA vez.
   *
   * Cambiar de período devuelve la página a `loading` y remonta el contenido:
   * sin interruptor, todo volvería a entrar en cada clic del filtro, justo
   * cuando lo que se quiere es comparar el número nuevo con el que había.
   *
   * Es estado y no una ref porque el lint prohíbe leer refs en render, y se
   * apaga por temporizador —no al terminar de cargar— para que el re-render
   * caiga DESPUÉS de que las animaciones acabaron: apagarlo antes reiniciaría
   * los efectos a media animación y cortaría el contador en un número falso.
   */
  const contentReady = state === "ready" && data !== null;
  const [entrance, setEntrance] = useState(true);
  useEffect(() => {
    if (!contentReady || !entrance) return;
    const id = setTimeout(() => setEntrance(false), ENTRANCE_MS);
    return () => clearTimeout(id);
  }, [contentReady, entrance]);

  // El contenedor de la entrada escalonada: busca los `data-reveal` que haya
  // debajo, sean los que sean. No lleva lista de tarjetas porque los bloques
  // son condicionales y una lista fija se rompería con cada combinación.
  const shell = useRef<HTMLDivElement>(null);
  useReveal(shell, contentReady && entrance);
  // Movimiento que SIGUE después de la carga, y por eso NO va atado a
  // `entrance`: el ambiente acompaña mientras la pantalla esté abierta y la
  // respuesta al puntero existe siempre.
  useAmbient(shell, contentReady);
  useHoverLift(shell, contentReady);

  const load = useCallback(async () => {
    // Con datos en pantalla el estado se queda en `ready`: un refetch NO puede
    // desmontar el cuerpo, porque el selector de profesional vive dentro y
    // filtrar desmontaría el propio control recién usado —el foco de teclado
    // caía al `body`— además de blanquear tarjetas que ese filtro ni toca.
    // Updater funcional a propósito: leer `state` aquí lo metería en las
    // dependencias y cada carga cambiaría la identidad de `load`.
    setState((s) => (s === "ready" ? "ready" : "loading"));
    setBusy(true);
    try {
      const summary = await getValueSummary(reportRange, professionalId);
      setData(summary);
      setState("ready");
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : "Error al cargar los reportes",
        status: e instanceof ApiError ? e.status : null,
      });
      setState("error");
    } finally {
      setBusy(false);
    }
  }, [reportRange, professionalId]);

  useEffect(() => {
    if (bizState !== "ready" || !business || isStaff || rangeError) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [bizState, business, isStaff, load, rangeError]);

  if (isStaff) return null;

  if (bizState === "error") {
    return (
      <ErrorState
        title="No se pudo cargar el negocio"
        description={bizError ?? "Ocurrió un error al obtener los datos del negocio."}
        onRetry={refetchBusiness}
      />
    );
  }

  if (state === "error" && error) {
    // 403 (staff): el mensaje ES la respuesta, reintentar no cambia nada.
    return (
      <ErrorState
        title="No se pudieron cargar los reportes"
        description={error.message}
        onRetry={error.status === 403 ? undefined : () => void load()}
      />
    );
  }

  // Antes del primer dato no hay ni nombre de negocio que poner en la cabecera:
  // ahí sí se ocupa la pantalla entera.
  if (bizState !== "ready" || !business) {
    return <Loading rows={6} label="Cargando reportes…" />;
  }

  const windowCaption = isCustom
    ? `${reportRange.date_from} → ${reportRange.date_to} (${plural(reportRange.days, "día", "días")})`
    : `últimos ${reportRange.days} días`;

  return (
    <div ref={shell} className="space-y-6">
      {/* La cabecera se dibuja SIEMPRE, también mientras carga.
          Antes toda la página se reemplazaba por el cargador, así que cambiar
          de período desmontaba el propio desplegable que se acababa de usar y
          el foco de teclado caía al `body`: quien navega sin ratón perdía el
          sitio en cada filtrado. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.65rem] font-bold tracking-tight text-foreground">
            Reportes
          </h1>
          <p className="mt-1.5 text-[0.8rem] text-muted-foreground">
            Lo que yitopro hace por {business.name} · {windowCaption}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reports-period">Período</Label>
            <Select
              items={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
              value={period}
              onValueChange={(v) => setFilters({ p: (v as ReportPeriod) ?? period })}
            >
              {/* El alto va con el MISMO modificador que usa el primitivo
                  (`data-[size=default]:h-9` en components/ui/select.tsx): un
                  `h-11` a secas tiene menos especificidad y pierde — medido en
                  navegador, el control se quedaba en 36 px con el mínimo
                  táctil en 44. */}
              <SelectTrigger
                id="reports-period"
                className="w-44 data-[size=default]:h-11 sm:data-[size=default]:h-9"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isCustom ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reports-from">Desde</Label>
                <Input
                  id="reports-from"
                  type="date"
                  max={f.to || todayISO()}
                  value={f.from}
                  onChange={(e) => setFilters({ from: e.target.value })}
                  className="h-11 w-[9.5rem] sm:h-9"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reports-to">Hasta</Label>
                {/* El propio calendario acota el tope de 90 días: es preferible
                    que la fecha inválida no se pueda ELEGIR a avisar después de
                    que se eligió. El aviso sigue puesto porque la URL se escribe
                    a mano y `max` no protege de eso. */}
                <Input
                  id="reports-to"
                  type="date"
                  min={f.from || undefined}
                  max={maxToISO(f.from)}
                  value={f.to}
                  onChange={(e) => setFilters({ to: e.target.value })}
                  className="h-11 w-[9.5rem] sm:h-9"
                />
              </div>
            </>
          ) : null}
          {/* El CSV es el registro de COBROS, no el reporte entero: si el
              negocio no tiene bloque de cobros, el botón prometía un archivo
              que solo podía salir con la fila de encabezados. */}
          {data?.blocks.payments ? <CsvExportButton range={reportRange} /> : null}
        </div>
      </div>

      {/* El motivo va junto a los campos y NO como un error de carga: con el par
          a medio escribir no se pidió nada, así que en pantalla sigue la última
          ventana buena. */}
      {rangeError ? (
        <p role="alert" className="text-[0.8rem] text-destructive">
          {rangeError}
        </p>
      ) : null}

      {/* `Loading` traía el `role="status"` que anunciaba la espera; al dejar
          el cuerpo montado durante un refetch, ese anuncio se pone aquí. */}
      <p role="status" aria-live="polite" className="sr-only">
        {busy ? "Actualizando reportes…" : ""}
      </p>

      {state === "loading" || !data ? (
        <Loading rows={5} label="Cargando reportes…" />
      ) : (
        <ReportBody
          busy={busy}
          data={data}
          business={business}
          range={reportRange}
          professionalId={professionalId}
          onProfessionalChange={(id) =>
            setFilters({ prof: id === undefined ? "" : String(id) })
          }
          animate={entrance}
        />
      )}
    </div>
  );
}

/** El cuerpo del reporte. Separado de la cabecera para que esta no se desmonte
 *  al recargar: ver el comentario del foco de teclado más arriba. */
function ReportBody({
  data,
  busy,
  business,
  range,
  professionalId,
  onProfessionalChange,
  animate,
}: {
  data: ValueSummary;
  busy: boolean;
  business: { created_at: string };
  range: ReturnType<typeof reportWindow>;
  professionalId?: number;
  onProfessionalChange: (id: number | undefined) => void;
  animate: boolean;
}) {
  const router = useRouter();
  const { core, blocks } = data;
  const totalReplies = core.replies.ai + core.replies.operator;
  const lifetimeDays = daysSinceSignup(business.created_at);

  // La frase «todavía no ha atendido a nadie» ancla en la VIDA del negocio, así
  // que solo es cierta si la ventana cubre esa vida entera. Con «Últimos 7 días»
  // el cero es de la semana, no del negocio, y la frase acusaría de nada a un
  // tenant de meses tras una semana tranquila.
  //
  // La condición es SOLO la comparación de días: al desaparecer el preset «desde
  // el inicio» dejó de haber una ventana privilegiada, y así queda más general —
  // un negocio de 20 días con la ventana de 30 también tiene su vida cubierta.
  const isLifetimeWindow = range.days >= lifetimeDays;

  return (
    // Durante un refetch el contenido sigue ahí, atenuado: se ve que está
    // cambiando sin que la pantalla desaparezca bajo los pies de quien filtra.
    <div
      aria-busy={busy}
      className={cn("space-y-6 transition-opacity", busy && "opacity-60")}
    >
      {/* Núcleo universal — o, sin respuestas, un vacío que no inventa
          tarjetas en cero: un cero estructural es un dato del sistema recién
          instalado, no del negocio. */}
      {totalReplies === 0 ? (
        isLifetimeWindow ? (
          <EmptyState
            icon={Sparkles}
            title="Tu asistente todavía no ha atendido a nadie"
            description={`En ${plural(lifetimeDays, "día", "días")} con yitopro no hay ninguna respuesta registrada. En cuanto conteste su primer mensaje, esta pantalla se llena sola.`}
            // Sin ninguna respuesta en toda la vida del negocio, lo primero que
            // hay que descartar es que el canal no esté conectado: es la única
            // acción que puede cambiar este cero.
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/settings")}
              >
                Revisar conexión de WhatsApp
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={MessageSquareDashed}
            title="Sin respuestas en este período"
            description={`Tu negocio no envió mensajes en los últimos ${range.days} días. Prueba con un período más amplio.`}
          />
        )
      ) : (
        <section aria-labelledby="reports-core">
          {/* La tira son cinco tarjetas sueltas: sin este rótulo no tienen
              nombre de grupo y quedan huérfanas en el índice de la página. */}
          <h2 id="reports-core" className="sr-only">
            Actividad del asistente
          </h2>
          <CoreStrip core={core} animate={animate} />
        </section>
      )}

      {/* EL DINERO, a ancho completo y en su propia franja.
          Es la respuesta a «¿qué hizo yitopro por mi negocio?» y estaba por
          debajo del fold detrás de cinco contadores de proceso. Va fuera de la
          grilla de abajo a propósito: metido dentro, su fila entraba en el
          reparto de altura y arrastraba a las otras seis. */}
      {blocks.payments ? (
        <PaymentsMoneyCard payments={blocks.payments} range={range} />
      ) : null}

      {/* LAS SEIS TARJETAS DE DETALLE, TODAS DEL MISMO TAMAÑO.
          · `lg:auto-rows-fr` iguala el alto de las DOS filas entre sí, no solo
            el de las tarjetas dentro de cada fila. Va SOLO desde `lg`, que es
            donde la grilla tiene tres columnas y por tanto dos filas: aplicado
            sin breakpoint, en móvil —una columna, seis filas— igualaba las seis
            al alto de la más alta y la página pasaba de 3.821 a 5.758 px. Por
            debajo de `lg` el alto es natural, y el `stretch` de cada fila ya
            iguala a sus vecinas.
          · Sin `items-start`: cada tarjeta llena su celda. Es seguro porque
            todas comparten la misma anatomía —título, subtítulo de una línea,
            icono, contenido y pie anclado abajo—; el aire sobrante queda entre
            el contenido y el enlace, no como un cajón vacío. Antes estaba
            prohibido porque una tarjeta de una sola frase se estiraba a 450 px.
          · `dense`: los bloques son condicionales y las combinaciones dejan
            huecos; así una tarjeta sube a rellenar el que quedó libre.
          · `[&>*:only-child]:col-span-full`: con un solo bloque —un negocio de
            puros servicios— la grilla reservaba las otras dos pistas y dejaba
            dos tercios del ancho en blanco. */}
      <div className="grid grid-flow-row-dense gap-5 md:grid-cols-2 lg:auto-rows-fr lg:grid-cols-3 [&>*:only-child]:col-span-full">
        {blocks.appointments ? (
          <AppointmentsBlock
            agenda={blocks.appointments}
            professionalId={professionalId}
            onProfessionalChange={onProfessionalChange}
            animate={animate}
          />
        ) : null}
        {blocks.customers ? (
          <CustomersBlock customers={blocks.customers} animate={animate} />
        ) : null}
        {blocks.products ? (
          <ProductsBlock products={blocks.products} animate={animate} />
        ) : null}
        {blocks.payments ? (
          <PaymentsCompositionCard
            composition={blocks.payments.composition}
            animate={animate}
          />
        ) : null}
        {blocks.payments ? (
          <PaymentsLinksCard links={blocks.payments.links} animate={animate} />
        ) : null}
        {blocks.orders ? (
          <OrdersBlock
            aiConfirmedCount={blocks.orders.ai_confirmed_count}
            animate={animate}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * El `max` del campo «hasta»: hoy, o el último día que cabe en la ventana de
 * {@link MAX_RANGE_DAYS} desde «desde» — el que llegue primero.
 *
 * Se recorre por CAMPO de fecha y no sumando milisegundos: en una noche de
 * cambio de horario el día no dura 24 h y el tope se correría una fecha.
 */
function maxToISO(from: string): string {
  const today = todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return today;
  const [y, m, d] = from.split("-").map(Number);
  const last = new Date(y, m - 1, d + (MAX_RANGE_DAYS - 1));
  const iso = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  return iso < today ? iso : today;
}

/** «1 día» / «120 días» — el día 1 es justo cuando la frase de bienvenida se
 *  muestra, así que el plural mal puesto se ve siempre. */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// `useSearchParams` (dentro de `useUrlFilters`) exige un `<Suspense>` en el App
// Router — el mismo que ya envuelve pagos, clientes y conversaciones.
export default function ReportsPage() {
  return (
    <Suspense fallback={<Loading rows={6} label="Cargando reportes…" />}>
      <ReportsPageContent />
    </Suspense>
  );
}
