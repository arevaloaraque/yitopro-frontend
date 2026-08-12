"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, Link2, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListFooter } from "@/components/ui/list-footer";
import { RowOpenButton } from "@/components/ui/row-open-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterBar } from "@/components/filters/filter-bar";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import {
  CustomerCombobox,
  type CustomerSelection,
} from "@/components/customers/customer-combobox";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
import { PaymentLinkDialog } from "@/components/payments/payment-link-dialog";
import { PaymentDetailDialog } from "@/components/payments/payment-detail-dialog";
import { getCustomer } from "@/lib/api/customers";
import {
  listActivePaymentMethods,
  listPayments,
  paymentsSummary,
  reissuePaymentLink,
  verifyPayment,
  type Payment,
  type PaymentFilters,
  type PaymentLink,
  type PaymentMethodOption,
  type PaymentStatus,
  type PaymentSummaryRow,
} from "@/lib/api/payments";
import { listDate, formatDateTime } from "@/lib/format/date";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { subscribeToEvents } from "@/lib/sse";
import { formatPrice } from "@/lib/utils";

const PAGE_SIZE = 25;

const CUSTOM = "custom";

/**
 * Presets, not a free date picker.
 *
 * The summary endpoint REQUIRES a window and caps it at a year, because an
 * unbounded `SUM(amount)` is a full scan of the tenant's history. Offering
 * presets makes that bound structural instead of something a validation
 * message has to explain after the fact.
 */
const RANGES = [
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "365", label: "Último año" },
  { value: CUSTOM, label: "Personalizado…" },
] as const;

type RangeValue = (typeof RANGES)[number]["value"];

/**
 * Lo que la URL puede llevar, y su valor por defecto.
 *
 * `useUrlFilters` omite de la query todo lo que valga esto, así que la vista sin
 * filtrar es `/payments` pelado, y preserva las claves que no gestiona.
 */
const DEFAULT_FILTERS = {
  range: "30",
  status: "all",
  method: "all",
  customer: "",
  q: "",
  from: "",
  to: "",
};

/** A custom window is capped at 31 days. The presets are trailing and known;
 *  an arbitrary range is the one an operator can make enormous by accident, and
 *  the summary behind it is the query that pays for it. */
const MAX_CUSTOM_DAYS = 31;

/**
 * «Hoy» en la zona horaria del operador.
 *
 * `toISOString().slice(0,10)` daba el día UTC mientras `customWindow` interpreta
 * las mismas cadenas a medianoche LOCAL: en Chile, a partir de las 20:00 el
 * campo «hasta» arrancaba en mañana y su propio `max` lo daba por inválido.
 * `sv-SE` es el locale que formatea `YYYY-MM-DD`, que es lo que un
 * `<input type="date">` acepta.
 */
function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/** `[from, to)` from two `<input type="date">` values, in LOCAL midnight.
 *  The upper bound is the day AFTER `to`, because the backend window is
 *  half-open and "hasta el 5" has to include the 5th. */
function customWindow(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { created_from: start.toISOString(), created_to: end.toISOString() };
}

/** Empty string when the pair is usable. */
function customRangeError(from: string, to: string): string {
  if (!from || !to) return "Selecciona ambas fechas.";
  if (to < from) return "La fecha final es anterior a la inicial.";
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > MAX_CUSTOM_DAYS)
    return `El rango no puede superar ${MAX_CUSTOM_DAYS} días.`;
  return "";
}

const STATUSES: { value: PaymentStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "sent", label: "Enviados sin pagar" },
  { value: "paid", label: "Pagados" },
  { value: "pending", label: "Pendientes" },
  { value: "rejected", label: "Rechazados" },
  { value: "expired", label: "Expirados" },
];

function windowFor(days: RangeValue): { created_from: string; created_to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - Number(days) * 86_400_000);
  return { created_from: from.toISOString(), created_to: to.toISOString() };
}

type PageState = "loading" | "error" | "ready";

function PaymentsPageContent() {
  // Filtros en la URL: una vista filtrada se comparte por chat y sobrevive un
  // reload — quien encuentra el problema casi nunca es quien lo arregla.
  const [f, set] = useUrlFilters(DEFAULT_FILTERS);

  // Un `range` inventado a mano en la URL llegaría a `Number("lol")` → NaN →
  // `Invalid Date` → `toISOString()` lanza y la pantalla se queda en blanco.
  const range = (
    RANGES.some((r) => r.value === f.range) ? f.range : DEFAULT_FILTERS.range
  ) as RangeValue;
  const isCustom = range === CUSTOM;

  // Se teclea en `search` y se consulta con el valor ya reposado: lo que va al
  // backend Y a la URL es el retrasado, no una pulsación (un `replaceState` por
  // tecla llenaría el historial y pediría una página por letra).
  const [search, setSearch] = useState(f.q);
  const debouncedSearch = useDebounced(search);
  useEffect(() => {
    set({ q: debouncedSearch.trim() });
  }, [debouncedSearch, set]);

  const [customFrom, setCustomFrom] = useState(f.from);
  const [customTo, setCustomTo] = useState(f.to || todayISO());
  const rangeError = isCustom ? customRangeError(customFrom, customTo) : "";
  // El rango personalizado entra en la URL SOLO cuando es usable: un par a medio
  // escribir produciría un enlace que no reproduce lo que se ve en pantalla.
  useEffect(() => {
    set(
      isCustom && !rangeError
        ? { from: customFrom, to: customTo }
        : { from: "", to: "" },
    );
  }, [isCustom, rangeError, customFrom, customTo, set]);

  // El id manda: es lo que viaja al backend y lo que se comparte. El nombre solo
  // se pinta, y hasta que el servidor lo resuelve NO se inventa — sembrar desde
  // la URL escribía el literal «Cliente», que no es el nombre de nadie y deja al
  // operador creyendo que filtró por otra persona.
  const [customerName, setCustomerName] = useState("");
  const customer = useMemo<CustomerSelection>(
    () =>
      f.customer
        ? { id: f.customer, name: customerName || `Cliente #${f.customer}` }
        : null,
    [f.customer, customerName],
  );
  useEffect(() => {
    if (!f.customer || customerName) return;
    let cancelled = false;
    void (async () => {
      try {
        const c = await getCustomer(f.customer);
        if (!cancelled) setCustomerName(c.name);
      } catch {
        // Se queda en «Cliente #id»: identifica el filtro sin fingir un nombre.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [f.customer, customerName]);

  const [state, setState] = useState<PageState>("loading");
  // Hay una recarga en vuelo con datos ya en pantalla. Sin esto, cambiar de
  // periodo o de estado no daba ninguna señal: la tabla vieja se quedaba quieta
  // hasta que llegaba la nueva, y el operador la leía como el resultado.
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cursor, setCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summary, setSummary] = useState<PaymentSummaryRow[]>([]);
  const [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  // El catálogo de medios se cae en silencio: el Select quedaba con un solo
  // ítem («Todos los medios») y se leía como «este negocio no tiene medios»,
  // que es una conclusión de negocio sacada de un fallo de red.
  const [methodsFailed, setMethodsFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  // Qué filas tienen una acción en vuelo. Por `rowKey` y NO por id: la lista
  // entrelaza dos tablas y sus ids chocan (existen el pago 5 y el enlace 5 — por
  // eso el cursor del backend lleva `kind`), así que un id solo giraría y
  // desactivaría dos filas a la vez. Es un conjunto y no un único valor porque
  // verificar un pago no tiene por qué bloquear la fila de otro.
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [reissued, setReissued] = useState<PaymentLink | null>(null);
  // The row whose detail dialog is open. Only FINAL payment rows open one —
  // anything still actionable is operated from the row itself.
  const [detailRow, setDetailRow] = useState<Payment | null>(null);

  const filters: PaymentFilters = useMemo(
    () => ({
      status: f.status === "all" ? "" : (f.status as PaymentStatus),
      payment_method_id: f.method === "all" ? "" : f.method,
      customer_id: f.customer,
      search: f.q.trim(),
      // A half-typed custom range must not fire a request; the last good window
      // stays on screen until both dates are valid.
      // `windowFor` would get `Number("custom")` → NaN → Invalid Date, so an
      // incomplete custom range falls back to the 30-day default rather than
      // sending the backend two "Invalid Date" strings.
      ...(isCustom
        ? rangeError
          ? windowFor("30")
          : customWindow(customFrom, customTo)
        : windowFor(range)),
    }),
    // Dependencias primitivas y no el objeto `f`: el hook devuelve un objeto
    // nuevo en cada `set`, y con la identidad en las deps una escritura de URL
    // que no cambia ningún valor recrearía `load` y pediría la lista otra vez.
    //
    // `windowFor` se recalcula en cada cambio de filtro, lo que vuelve a anclar
    // "los últimos 30 días" a ahora. Es lo que promete la etiqueta.
    [f.status, f.method, f.customer, f.q, range, isCustom, rangeError, customFrom, customTo],
  );

  const load = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      // Both in flight together: the strip and the table share a window, and
      // serializing them would show one before the other.
      //
      // The summary takes the WINDOW ONLY — no filters, though the endpoint
      // accepts them. It counts paid rows by definition, so passing the table's
      // filters through made "Cobrado · últimos 30 días" render as `$0` the
      // moment an operator filtered by Pendientes. The card is a period total;
      // its own label says so, and now that is true.
      const [page, totals] = await Promise.all([
        listPayments(filters, { limit: PAGE_SIZE }),
        paymentsSummary({
          created_from: filters.created_from!,
          created_to: filters.created_to!,
        }),
      ]);
      setPayments(page.items);
      setCursor(page.next_cursor);
      setHasMore(page.has_more);
      setSummary(totals);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los pagos");
      setState("error");
    } finally {
      setRefreshing(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    listActivePaymentMethods()
      .then((rows) => {
        setMethods(rows);
        setMethodsFailed(false);
      })
      .catch(() => {
        setMethods([]);
        setMethodsFailed(true);
      });
  }, []);

  // A payment settling is the transition an operator sits waiting for. Read
  // `load` through a ref so the subscription is not torn down and rebuilt on
  // every filter change.
  const loadRef = useRef(load);
  // Same reason as `loadRef`: a row action's summary refetch resolves later and
  // has to compare its window against the one in effect THEN, not the one it
  // closed over.
  const filtersRef = useRef(filters);
  // Same reason again: the subscription decides between patching a row and a
  // full refetch based on WHICH rows are on screen when the frame arrives.
  const paymentsRef = useRef(payments);
  useEffect(() => {
    loadRef.current = load;
    filtersRef.current = filters;
    paymentsRef.current = payments;
  });
  // Payments this tab just resolved itself. The backend publishes post-commit,
  // so the SSE echo routinely beats our own HTTP response — and a refetch here
  // would drop the row off screen whenever a filter no longer matches it (the
  // "Pendientes" filter is exactly the one used to find rows worth verifying,
  // and a row confirming is exactly what stops matching it). Consume-once: a
  // LATER change to the same payment, by anyone, must still refresh.
  const selfApplied = useRef(new Set<string>());
  useEffect(
    () =>
      subscribeToEvents((event) => {
        if (event.type !== "pago_recibido" && event.type !== "pago_rechazado") return;
        const key = `payment-${event.data.payment_id}`;
        if (selfApplied.current.delete(key)) return;
        const row = paymentsRef.current.find(
          (r) => r.kind === "payment" && r.id === event.data.payment_id,
        );
        // Row on screen: patch it and refresh ONLY the totals, the same
        // trade-off handleVerify makes — a refetch under an active filter
        // would make the row vanish one beat after it settled.
        if (row) {
          patchRow(
            "payment",
            row.id,
            event.type === "pago_recibido" ? "paid" : "rejected",
          );
          refreshSummary({
            created_from: filtersRef.current.created_from!,
            created_to: filtersRef.current.created_to!,
          });
        } else {
          // A payment NOT on screen can be one we have never seen: refetch so
          // it appears.
          loadRef.current();
        }
      }),
    [],
  );

  /** Row identity. Two tables, colliding ids — never `p.id` on its own. */
  function rowKey(p: Payment): string {
    return `${p.kind}-${p.id}`;
  }

  function startPending(key: string) {
    setPending((prev) => new Set(prev).add(key));
  }

  function endPending(key: string) {
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function patchRow(kind: Payment["kind"], id: string, status: PaymentStatus) {
    setPayments((prev) =>
      prev.map((r) => (r.kind === kind && r.id === id ? { ...r, status } : r)),
    );
  }

  /**
   * Refetch ONLY the summary card for a window.
   *
   * The card is a separate SUM over paid rows, so patching a row alone leaves
   * "Cobrado" understating by that amount. Only the totals are refetched — not
   * `load()`, which would discard every page already scrolled in.
   */
  function refreshSummary(window: { created_from: string; created_to: string }) {
    paymentsSummary(window)
      .then((totals) => {
        // The operator can change the period while this is in flight; the
        // filter change refetches its own summary, and this stale one must
        // not land on top of it.
        if (
          window.created_from === filtersRef.current.created_from &&
          window.created_to === filtersRef.current.created_to
        ) {
          setSummary(totals);
        }
      })
      .catch(() => {});
  }

  /**
   * Re-check a payment against its gateway.
   *
   * The row is patched from the response instead of refetching, for two
   * independent reasons: a refetch under an active filter makes the row vanish
   * one beat after the toast, and a `rejected` outcome has to land somewhere
   * regardless.
   *
   * Three outcomes, deliberately not collapsed into "listo": `verdict: null`
   * means the gateway did not answer and NOTHING was written, so reporting it
   * as a refusal would tell an operator a live charge died.
   */
  async function handleVerify(p: Payment) {
    const key = rowKey(p);
    if (p.kind !== "payment" || pending.has(key)) return;
    startPending(key);
    // Armed BEFORE the request, not after it resolves. The backend publishes
    // post-commit but pre-return — inside the very view that answers us — so
    // the SSE frame routinely leaves the server ahead of the 200. Arming after
    // the await means the echo has already been consumed by the refetch this
    // is meant to suppress.
    const echoKey = `payment-${p.id}`;
    selfApplied.current.add(echoKey);
    // And released on every path where the server published nothing, or a
    // later genuine change to this payment would be swallowed instead.
    const disarm = () => selfApplied.current.delete(echoKey);
    // publish_event is best-effort and Redis pub/sub has no replay, so a frame
    // can simply never arrive. Without this the key would sit armed forever.
    const disarmTimer = setTimeout(disarm, 15_000);
    const window = {
      created_from: filters.created_from!,
      created_to: filters.created_to!,
    };
    try {
      const result = await verifyPayment(p.id);
      patchRow("payment", p.id, result.status);
      if (result.verdict === true) {
        toast.success(
          result.checked
            ? "Pago confirmado por la pasarela"
            : "Este pago ya estaba pagado",
        );
        refreshSummary(window);
      } else if (result.verdict === false) {
        toast.error("La pasarela rechazó este cobro");
      } else {
        // Nothing was written, so nothing was published: disarm now.
        clearTimeout(disarmTimer);
        disarm();
        toast.warning("No pudimos confirmar con la pasarela. El estado no cambió.");
      }
    } catch (e) {
      clearTimeout(disarmTimer);
      disarm();
      toast.error(e instanceof Error ? e.message : "No pudimos verificar el pago");
    } finally {
      endPending(key);
    }
  }

  /**
   * Hand the operator a usable URL for a link they already sent.
   *
   * There is no "copy": only the secret's sha256 is stored, so the URL cannot
   * be re-read — it is REPLACED, and the one sent earlier stops working. The
   * response opens the copy dialog rather than going straight to the clipboard,
   * because a write after an awaited fetch loses the transient activation
   * WebKit requires — and a failed write here would strand a one-time secret
   * with the old URL already dead.
   */
  async function handleReissue(p: Payment) {
    const key = rowKey(p);
    if (p.kind !== "link" || pending.has(key)) return;
    startPending(key);
    try {
      // `reference` is the link's public uuid — the same value the endpoint
      // addresses. The secret is not in it and never was.
      const link = await reissuePaymentLink(p.reference);
      setReissued(link);
      setLinkOpen(true);
      // No refetch: nothing the table renders changed. Only `expires_at` and
      // the secret moved, and neither is a column — the row stays `sent`,
      // since the backend refuses to reissue anything that is not already
      // live. A `load()` here would only discard every page scrolled in.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos generar el enlace");
    } finally {
      endPending(key);
    }
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      // The cursor is opaque and goes back verbatim. There is no page number to
      // compute: the backend never counts the rows behind us.
      const page = await listPayments(filters, { cursor, limit: PAGE_SIZE });
      setPayments((prev) => [...prev, ...page.items]);
      setCursor(page.next_cursor);
      setHasMore(page.has_more);
    } catch (e) {
      // Un toast y NO el `ErrorState`: las 25 filas ya cargadas siguen siendo
      // válidas, y derribar la pantalla entera por la página 2 tiraba también
      // el trabajo de leerlas.
      toast.error(e instanceof Error ? e.message : "Error al cargar más pagos");
    } finally {
      setLoadingMore(false);
    }
  }

  // Filtros de FILA: los que recortan la tabla pero NO la tarjeta de resumen,
  // que suma toda la ventana.
  const rowFilters =
    f.status !== "all" || f.method !== "all" || f.customer !== "" || f.q.trim() !== "";
  // El periodo también es un filtro: con «últimos 7 días» y cero movimientos,
  // «todavía no hay movimientos» manda al operador a buscar un fallo del
  // producto en vez de a mirar el periodo que puso.
  const filtered = rowFilters || range !== DEFAULT_FILTERS.range;

  function clearFilters() {
    set(DEFAULT_FILTERS);
    setSearch("");
    setCustomerName("");
    setCustomFrom("");
    setCustomTo(todayISO());
  }

  /** El periodo que de verdad se pidió, no el que dice el desplegable: con un
   *  rango personalizado inválido la consulta cae a los 30 días. */
  const periodLabel = isCustom
    ? rangeError
      ? "Últimos 30 días"
      : `${customFrom} a ${customTo}`
    : (RANGES.find((r) => r.value === range)?.label ?? "");

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Pagos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los cobros de tu negocio y el estado de cada uno.
        </p>
      </div>
      <Button onClick={() => setLinkOpen(true)}>
        <Link2 className="size-4" />
        Nuevo enlace de pago
      </Button>
    </div>
  );

  if (state === "loading") return <Loading rows={6} label="Cargando pagos…" />;

  if (state === "error") {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {header}
        <ErrorState description={error ?? "Error desconocido"} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {header}

      {/* Totals for the window the table is showing, one card per currency —
          adding CLP to USD produces a number that is wrong in both. */}
      {summary.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map((row) => (
            <div
              key={row.currency}
              className="rounded-xl border border-border bg-card p-4"
            >
              <p className="text-xs text-muted-foreground">
                Cobrado · {row.currency} · {periodLabel}
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">
                {formatPrice(row.paid_amount, row.currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {row.paid_count} de {row.total_count}{" "}
                {row.total_count === 1 ? "pago" : "pagos"} confirmados
              </p>
              {/* Dicho, y no deducido: la tarjeta suma la ventana ENTERA a
                  propósito (son pagados por definición, así que arrastrar el
                  filtro «Pendientes» la dejaba en $0), y sin decirlo se lee
                  como el total de lo que la tabla está mostrando. */}
              {rowFilters && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Cubre todo el periodo: no aplica los filtros de la tabla.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <FilterBar active={filtered} onClear={clearFilters}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-range">Periodo</Label>
          {/* `items` is not optional decoration on this Select: without the
              value→label map the trigger renders the raw value, so the
              filter read "30" and "all" instead of naming itself. */}
          <Select
            items={RANGES.map((r) => ({ value: r.value, label: r.label }))}
            value={range}
            onValueChange={(v) => set({ range: (v as RangeValue) ?? range })}
          >
            <SelectTrigger id="pay-range" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isCustom && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-from">Desde / hasta</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="pay-from"
                type="date"
                value={customFrom}
                max={customTo || todayISO()}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-auto"
                aria-invalid={rangeError ? true : undefined}
                aria-describedby="pay-range-hint"
              />
              <span className="text-sm text-muted-foreground">a</span>
              <Input
                id="pay-to"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                max={todayISO()}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-auto"
                aria-invalid={rangeError ? true : undefined}
                aria-describedby="pay-range-hint"
              />
            </div>
            <p
              id="pay-range-hint"
              role={rangeError ? "alert" : undefined}
              className={
                rangeError
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {rangeError ||
                `Ambas fechas incluidas, máximo ${MAX_CUSTOM_DAYS} días.`}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-status">Estado</Label>
          <Select
            items={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
            value={f.status}
            onValueChange={(v) => set({ status: (v as string) ?? "all" })}
          >
            <SelectTrigger id="pay-status" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-method">Medio de pago</Label>
          {/* `?? "all"`: the Select clears to null, and a null filter value
              would drop the controlled input back to an empty trigger. */}
          <Select
            items={[
              { value: "all", label: "Todos los medios" },
              ...methods.map((m) => ({ value: m.id, label: m.label })),
            ]}
            value={f.method}
            onValueChange={(v) => set({ method: (v as string) ?? "all" })}
          >
            <SelectTrigger id="pay-method" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los medios</SelectItem>
              {methods.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {methodsFailed && (
            <p role="alert" className="max-w-64 text-xs text-destructive">
              No pudimos cargar los medios de pago. La lista de arriba está
              incompleta, no vacía.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-customer">Cliente</Label>
          <CustomerCombobox
            id="pay-customer"
            value={customer}
            onChange={(sel) => {
              set({ customer: sel?.id ?? "" });
              setCustomerName(sel?.name ?? "");
            }}
            placeholder="Todos los clientes"
            className="w-64"
          />
        </div>

        <div className="flex min-w-72 flex-1 flex-col gap-1.5">
          <Label htmlFor="pay-search">Código de operación</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="pay-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="YTO-12-a1b2c3…"
              className="pl-8 font-mono text-sm"
              aria-describedby="pay-search-hint"
            />
          </div>
          {/* Says what it does, because "buscar" that only matches the start of
              a code is otherwise read as broken. It is a prefix because that is
              what the index serves; to find a person, use Cliente. */}
          <p id="pay-search-hint" className="text-xs text-muted-foreground">
            Busca por el inicio del código de un pago; los enlaces no tienen uno
            todavía. Para buscar por persona, usa Cliente.
          </p>
        </div>
      </FilterBar>

      {/* `aria-busy` con acompañante de texto, no solo la opacidad: una señal que
          existe únicamente como color no llega a quien no la ve. */}
      <div
        aria-busy={refreshing}
        className={refreshing ? "space-y-6 opacity-60" : "space-y-6"}
      >
        {refreshing && (
          <p role="status" className="mb-2 text-xs text-muted-foreground">
            Actualizando…
          </p>
        )}
        {payments.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={Search}
              title="Sin resultados"
              description="Ningún pago coincide con estos filtros en el periodo elegido."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={CreditCard}
              title="Todavía no hay movimientos"
              description="Genera un enlace de pago y compártelo con tu cliente por WhatsApp."
              action={
                <Button onClick={() => setLinkOpen(true)}>
                  <Link2 className="size-4" />
                  Nuevo enlace de pago
                </Button>
              }
            />
          )
        ) : (
          <Table>
            <TableHeader>
              {/* Columns drop by breakpoint instead of surviving behind a
                  horizontal scroll: on a phone the scroll left "Cliente | Medio"
                  on screen and pushed the two things anyone opens this table
                  for — monto and estado — out of sight. */}
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Medio</TableHead>
                <TableHead className="hidden xl:table-cell">Proveedor</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="w-32">Estado</TableHead>
                <TableHead className="hidden w-28 sm:table-cell">Fecha</TableHead>
                <TableHead className="hidden w-44 lg:table-cell">Código</TableHead>
                {/* `w-12`, not the `w-20` other screens use: no row can ever
                    show two buttons — a link has no payment to verify and a
                    payment has no retrievable URL — and at 375px the always-on
                    columns already fill the width, so the extra 32px would push
                    Estado behind the scroll fade. */}
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const key = rowKey(p);
                const busy = pending.has(key);
                // A FINAL payment has no row action left; the row itself becomes
                // the action — it opens the detail dialog. Anything else (links,
                // payments still in flight) stays a plain row.
                const finalPayment =
                  p.kind === "payment" &&
                  (p.status === "paid" || p.status === "rejected");
                const name = p.customer_name || (
                  <span className="text-muted-foreground">Sin cliente</span>
                );
                return (
                  <TableRow
                    key={key}
                    // Sin `role="button"`, sin `tabIndex` y sin `onKeyDown`: el
                    // rol implica *Children Presentational*, así que el lector
                    // anunciaba «Ver detalle del pago de Ana Pérez, botón» y ni
                    // monto, ni estado, ni fecha — la tabla dejaba de ser tabla.
                    // Y el foco se apagaba con `outline-none` sin reemplazo
                    // (medido: 1,04:1 de contraste contra el fondo de la fila).
                    // El teclado entra ahora por el botón de la celda Cliente,
                    // que es la columna que nunca cae por breakpoint; el click
                    // de la fila se queda como comodidad de ratón.
                    {...(finalPayment
                      ? {
                          className: "cursor-pointer",
                          onClick: () => setDetailRow(p),
                        }
                      : {})}
                  >
                    <TableCell className="font-medium">
                      {finalPayment ? (
                        <RowOpenButton
                          label={`Ver detalle del pago de ${
                            p.customer_name || "cliente sin nombre"
                          }`}
                          onOpen={() => setDetailRow(p)}
                        >
                          {name}
                        </RowOpenButton>
                      ) : (
                        name
                      )}
                      {/* For a LINK the concept is the whole description — it has
                          no method yet — so this line stays at every width. For a
                          payment it carries the method, whose own column is dropped
                          on a phone. `whitespace-normal` undoes the table's global
                          `nowrap`: without it "Transferencia bancaria (SafetyPay)"
                          sets this column's min-content width and pushes Estado off
                          a 390px screen, which is the column the phone layout
                          exists to keep. */}
                      <span
                        className={`block max-w-[42vw] text-xs font-normal whitespace-normal text-muted-foreground ${
                          p.kind === "link" ? "" : "md:hidden"
                        }`}
                      >
                        {p.kind === "link" ? p.concept : p.method_label}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {p.method_label || (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    {/* Two facts in one cell: the brand the customer paid with, and
                        the gateway that processed it. Once a second gateway can
                        carry the same brand they stop being the same answer, and
                        "por dónde entró la plata" is the reconciliation question. */}
                    <TableCell className="hidden xl:table-cell">
                      {p.channel_name ? (
                        <>
                          <span className="block text-sm">{p.channel_name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {p.provider_name}
                          </span>
                        </>
                      ) : (
                        // No gateway until the customer chooses one at checkout.
                        <span className="text-sm text-muted-foreground/60">
                          Sin elegir
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {/* Per row, not `useMoney`: a payment carries its own currency
                          and the tenant-bound formatter would print a USD charge
                          with a CLP symbol. */}
                      {formatPrice(p.amount, p.currency)}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell
                      className="hidden text-xs text-muted-foreground tabular-nums sm:table-cell"
                      title={formatDateTime(p.created_at)}
                    >
                      {listDate(p.created_at)}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                      {/* A link's uuid is long and its tail is the useful part for
                          matching one row against a shared URL. */}
                      {p.kind === "link" ? `…${p.reference.slice(-8)}` : p.reference}
                    </TableCell>
                    {/* Gated on `kind` FIRST and status second. A link row's status
                        is `sent`, which passes a "not final" status test — and its
                        id belongs to a different table, so verifying it would send
                        an unrelated payment to the gateway and possibly write it
                        `rejected`. */}
                    <TableCell className="text-right">
                      {p.kind === "link" && p.status === "sent" && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          // El área táctil crece con un `::after` y no con el
                          // tamaño del botón: la columna es `w-12` a propósito
                          // (un botón mayor empujaría Estado detrás del scroll
                          // en un teléfono). Ninguna fila muestra dos acciones,
                          // así que esta área ampliada no se solapa con nada.
                          className="relative after:absolute after:-inset-1.5"
                          // Solo esta fila: verificar un pago no tiene por qué
                          // desactivar el enlace de otro.
                          disabled={busy}
                          // The row itself may open the detail dialog; an action
                          // button must not bubble into that.
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReissue(p);
                          }}
                          // Not "copiar": there is nothing to copy. The URL is
                          // replaced, and the operator has to know that before
                          // clicking, not after.
                          title="Generar un enlace nuevo para este cobro (el anterior dejará de funcionar)"
                          aria-label={`Generar un enlace nuevo para el cobro de ${
                            p.customer_name || "cliente sin nombre"
                          }`}
                        >
                          {busy ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Link2 className="size-3.5" />
                          )}
                        </Button>
                      )}
                      {p.kind === "payment" &&
                        p.status !== "paid" &&
                        p.status !== "rejected" && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="relative after:absolute after:-inset-1.5"
                            disabled={busy}
                            // Same stopPropagation as the reissue button: the row
                            // click opens the detail dialog.
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVerify(p);
                            }}
                            title="Consultar el estado real con la pasarela"
                            aria-label={`Verificar con la pasarela el pago de ${
                              p.customer_name || "cliente sin nombre"
                            }`}
                          >
                            {busy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3.5" />
                            )}
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Dentro de la región ocupada: el conteo describe justo estas filas, y
            fuera se quedaba nítido anunciando el número de la carga anterior.
            Sin `total`: el backend nunca cuenta las filas que quedan detrás del
            cursor, así que «de M» es un número que esta API no puede producir. */}
        <ListFooter
          shown={payments.length}
          hasMore={hasMore}
          loading={loadingMore}
          onLoadMore={loadMore}
          noun="registro"
          nounPlural="registros"
        />
      </div>

      {/* `key` remounts on a reissue so the dialog seeds its copy step from
          `reissued` with no effect to synchronise; clearing it on close puts
          the dialog back to its normal "mint a new link" form. */}
      <PaymentLinkDialog
        key={reissued?.public_id ?? "new"}
        open={linkOpen}
        onOpenChange={(next) => {
          setLinkOpen(next);
          if (!next) setTimeout(() => setReissued(null), 200);
        }}
        onCreated={load}
        reissued={reissued}
      />

      <PaymentDetailDialog
        row={detailRow}
        open={detailRow !== null}
        onOpenChange={(next) => {
          if (!next) setDetailRow(null);
        }}
      />
    </div>
  );
}

// `useSearchParams` (dentro de `useUrlFilters`) exige un `<Suspense>` en el App
// Router. Con `fallback={null}` la ruta se quedaba en blanco durante la
// hidratación, indistinguible de una pantalla rota.
export default function PaymentsPage() {
  return (
    <Suspense fallback={<Loading rows={6} label="Cargando pagos…" />}>
      <PaymentsPageContent />
    </Suspense>
  );
}
