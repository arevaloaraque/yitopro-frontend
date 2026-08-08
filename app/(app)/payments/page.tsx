"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  CreditCard,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import {
  CustomerCombobox,
  type CustomerSelection,
} from "@/components/customers/customer-combobox";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
import { PaymentLinkDialog } from "@/components/payments/payment-link-dialog";
import { PaymentDetailDialog } from "@/components/payments/payment-detail-dialog";
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

/** A custom window is capped at 31 days. The presets are trailing and known;
 *  an arbitrary range is the one an operator can make enormous by accident, and
 *  the summary behind it is the query that pays for it. */
const MAX_CUSTOM_DAYS = 31;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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
  const searchParams = useSearchParams();

  // Filters seed from the URL so a filtered view is shareable and survives a
  // reload — the operator who found the problem is rarely the one who fixes it.
  const [range, setRange] = useState<RangeValue>(
    () => (searchParams.get("range") as RangeValue) || "30",
  );
  const [status, setStatus] = useState<PaymentStatus | "all">(
    () => (searchParams.get("status") as PaymentStatus) || "all",
  );
  const [methodId, setMethodId] = useState<string>(
    () => searchParams.get("method") || "all",
  );
  const [customer, setCustomer] = useState<CustomerSelection>(() => {
    const id = searchParams.get("customer");
    return id ? { id, name: "Cliente" } : null;
  });
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [customFrom, setCustomFrom] = useState(() => searchParams.get("from") || "");
  const [customTo, setCustomTo] = useState(() => searchParams.get("to") || todayISO());

  const isCustom = range === CUSTOM;
  const rangeError = isCustom ? customRangeError(customFrom, customTo) : "";

  const [state, setState] = useState<PageState>("loading");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cursor, setCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summary, setSummary] = useState<PaymentSummaryRow[]>([]);
  const [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  // Which row has an action in flight. Keyed by `rowKey`, NOT by id: the list
  // interleaves two tables and their ids collide (payment 5 and link 5 both
  // exist — it is why the backend cursor carries `kind`), so an id alone would
  // spin and disable two rows at once.
  const [pending, setPending] = useState<string | null>(null);
  const [reissued, setReissued] = useState<PaymentLink | null>(null);
  // The row whose detail dialog is open. Only FINAL payment rows open one —
  // anything still actionable is operated from the row itself.
  const [detailRow, setDetailRow] = useState<Payment | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const filters: PaymentFilters = useMemo(
    () => ({
      status: status === "all" ? "" : status,
      payment_method_id: methodId === "all" ? "" : methodId,
      customer_id: customer?.id ?? "",
      search: debouncedSearch.trim(),
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
    // `windowFor` is recomputed on every filter change, which re-anchors "los
    // últimos 30 días" to now. That is what the label promises.
    [
      status,
      methodId,
      customer,
      debouncedSearch,
      range,
      isCustom,
      rangeError,
      customFrom,
      customTo,
    ],
  );

  // Keep the URL in step. `replaceState`, not router.push: pushing would add a
  // history entry per keystroke and re-render the route to change a query param.
  useEffect(() => {
    const params = new URLSearchParams();
    if (range !== "30") params.set("range", range);
    if (status !== "all") params.set("status", status);
    if (methodId !== "all") params.set("method", methodId);
    if (customer) params.set("customer", customer.id);
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    if (isCustom && !rangeError) {
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [
    range,
    status,
    methodId,
    customer,
    debouncedSearch,
    isCustom,
    rangeError,
    customFrom,
    customTo,
  ]);

  const load = useCallback(async () => {
    setError(null);
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
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    listActivePaymentMethods()
      .then(setMethods)
      .catch(() => setMethods([]));
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
    if (p.kind !== "payment" || pending) return;
    setPending(rowKey(p));
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
      setPending(null);
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
    if (p.kind !== "link" || pending) return;
    setPending(rowKey(p));
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
      setPending(null);
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
      setError(e instanceof Error ? e.message : "Error al cargar más pagos");
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered =
    status !== "all" ||
    methodId !== "all" ||
    customer !== null ||
    debouncedSearch.trim() !== "";

  function clearFilters() {
    setStatus("all");
    setMethodId("all");
    setCustomer(null);
    setSearch("");
  }

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
                Cobrado · {row.currency} ·{" "}
                {isCustom && !rangeError
                  ? `${customFrom} a ${customTo}`
                  : RANGES.find((r) => r.value === range)?.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">
                {formatPrice(row.paid_amount, row.currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {row.paid_count} de {row.total_count}{" "}
                {row.total_count === 1 ? "pago" : "pagos"} confirmados
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          Filtros
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7"
              onClick={clearFilters}
            >
              Limpiar
            </Button>
          )}
        </div>
        {/* Flex-wrap, not a rigid grid: the triggers are w-fit, so a 4-track
            grid left wide dead gaps between compact controls and squeezed the
            long labels ("Tarjeta de crédito o débito") into ellipsis. Fixed,
            readable widths pack the controls together with the text whole. */}
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-range">Periodo</Label>
            {/* `items` is not optional decoration on this Select: without the
                value→label map the trigger renders the raw value, so the
                filter read "30" and "all" instead of naming itself. */}
            <Select
              items={RANGES.map((r) => ({ value: r.value, label: r.label }))}
              value={range}
              onValueChange={(v) => setRange((v as RangeValue) ?? range)}
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
              value={status}
              onValueChange={(v) => setStatus((v as PaymentStatus | "all") ?? "all")}
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
              value={methodId}
              onValueChange={(v) => setMethodId(v ?? "all")}
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-customer">Cliente</Label>
            <CustomerCombobox
              id="pay-customer"
              value={customer}
              onChange={setCustomer}
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
        </div>
      </div>

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
              // A FINAL payment has no row action left; the row itself becomes
              // the action — it opens the detail dialog. Anything else (links,
              // payments still in flight) stays a plain row.
              const finalPayment =
                p.kind === "payment" &&
                (p.status === "paid" || p.status === "rejected");
              return (
              <TableRow
                key={rowKey(p)}
                {...(finalPayment
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-label": `Ver detalle del pago de ${
                        p.customer_name || "cliente sin nombre"
                      }`,
                      className:
                        "cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none",
                      onClick: () => setDetailRow(p),
                      onKeyDown: (e: KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetailRow(p);
                        }
                      },
                    }
                  : {})}
              >
                <TableCell className="font-medium">
                  {p.customer_name || (
                    <span className="text-muted-foreground">Sin cliente</span>
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
                    <span className="text-sm text-muted-foreground/60">Sin elegir</span>
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
                      disabled={pending !== null}
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
                      {pending === rowKey(p) ? (
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
                        disabled={pending !== null}
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
                        {pending === rowKey(p) ? (
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

      {payments.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {/* "N pagos" and not "N de M": there is no M. The backend refuses to
              count a filtered slice of a tenant's history on every page. */}
          <span>
            {payments.length} {payments.length === 1 ? "registro" : "registros"}
            {hasMore ? " (hay más)" : ""}
          </span>
          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? "Cargando…" : "Cargar más"}
            </Button>
          )}
        </div>
      )}

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

// `useSearchParams` requires a Suspense boundary in the App Router.
export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentsPageContent />
    </Suspense>
  );
}
