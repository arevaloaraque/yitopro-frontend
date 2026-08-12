"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CharCountInput } from "@/components/ui/char-count-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  CustomerCombobox,
  type CustomerSelection,
} from "@/components/customers/customer-combobox";
import { createPaymentLink, type PaymentLink } from "@/lib/api/payments";
import { listAppointments } from "@/lib/api/appointments";
import { listOrders, type Order } from "@/lib/api/orders";
import { useMoney } from "@/lib/business/use-money";
import { formatDateTime } from "@/lib/format/date";
import type { Appointment } from "@/lib/types";

const NONE = "none";

/**
 * What the charge is against.
 *
 * A cita and a pedido are the two things this product bills for, and the
 * backend answers 400 if a link names both. One Select over the union enforces
 * that by construction — two selects would let the operator set a pair the API
 * then rejects, which is a validation error the UI could simply not allow.
 */
type Target =
  | { kind: "none" }
  | { kind: "appointment"; id: string }
  | { kind: "order"; id: string };

const NO_TARGET: Target = { kind: "none" };

/** `appointment:12` / `order:7` — one Select value over two entity types. */
function encodeTarget(t: Target): string {
  return t.kind === "none" ? NONE : `${t.kind}:${t.id}`;
}

function decodeTarget(value: string): Target {
  const [kind, id] = value.split(":");
  if (kind === "appointment" && id) return { kind: "appointment", id };
  if (kind === "order" && id) return { kind: "order", id };
  return NO_TARGET;
}

/**
 * Mints a payment link and then makes the operator copy it.
 *
 * Two steps, not one, because of an asymmetry in the backend: the link's secret
 * lives only inside the URL of the 201 response — only its sha256 is stored, so
 * nothing can ever show it again. A dialog that closed on success would hand
 * the operator a link they can never retrieve, so the second step exists purely
 * to make losing it deliberate.
 */
export function PaymentLinkDialog({
  open,
  onOpenChange,
  onCreated,
  reissued = null,
  preset = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  /**
   * A link the caller already rotated, to open straight on the copy step.
   *
   * The row action in the payments table has nowhere safe to put a one-time
   * secret: writing it to the clipboard after an awaited POST loses the
   * transient activation WebKit requires, and if that write fails the operator
   * has a dead old URL and an unrecoverable new one. So the POST happens there
   * and the URL lands here, where the copy is a real click and the selectable
   * input is the fallback that already exists.
   *
   * Seeded through `useState`, not an effect — the caller remounts with a
   * `key`, so there is nothing to synchronise.
   */
  reissued?: PaymentLink | null;
  /**
   * A charge that already exists elsewhere — the appointment detail popover
   * opens this dialog with its cita pre-chosen rather than making the
   * operator find customer, target, amount and concept all over again.
   * Everything stays editable: a quote is not always the list figure.
   *
   * Like `reissued`, seeded through `useState` under a caller-supplied `key`.
   */
  preset?: {
    customer: NonNullable<CustomerSelection>;
    appointment: Appointment;
  } | null;
}) {
  const money = useMoney();
  const [concept, setConcept] = useState(
    preset
      ? preset.appointment.service_name ||
          `Cita ${formatDateTime(preset.appointment.start)}`
      : "",
  );
  const [amount, setAmount] = useState(
    preset?.appointment.service_price !== undefined
      ? String(preset.appointment.service_price)
      : "",
  );
  const [customer, setCustomer] = useState<CustomerSelection>(preset?.customer ?? null);
  const [target, setTarget] = useState<Target>(
    preset ? { kind: "appointment", id: preset.appointment.id } : NO_TARGET,
  );
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [minted, setMinted] = useState<PaymentLink | null>(reissued);
  // What produced the link currently on the copy step — NOT the prop. The
  // prop belongs to the page and stays set for the whole time the dialog is
  // open, so branching the wording on it made "Crear otro" mint a brand-new
  // link and still announce that a previous one had been killed.
  const [wasReissue, setWasReissue] = useState(reissued !== null);
  const [copied, setCopied] = useState(false);

  // Both lists are scoped to the chosen customer, and there is no unscoped
  // state: listing everyone's would let an operator attach a stranger's cita or
  // pedido to this charge — a wrong charge that then has a paper trail.
  useEffect(() => {
    let cancelled = false;
    // Deferred: keeps setState off the effect's synchronous path
    // (react-hooks/set-state-in-effect), the same idiom as products/page.tsx.
    const t = setTimeout(async () => {
      if (!open || !customer) {
        if (!cancelled) {
          setAppointments([]);
          setOrders([]);
          setTarget(NO_TARGET);
        }
        return;
      }
      // Las dos listas devuelven el sobre paginado `{items, count}`, no un array,
      // y las dos llevan `limit` explícito: este Select no tiene «cargar más»,
      // así que lo que no venga en esta página no se puede cobrar. Sin el límite
      // a la vista quedaba el default del servidor (100 en citas) decidiendo en
      // silencio qué se podía cobrar y qué no.
      const [appts, ords] = await Promise.all([
        listAppointments({ customer_id: customer.id, limit: 50 })
          .then((res) => res.items)
          .catch(() => []),
        listOrders(undefined, { customer_id: customer.id, limit: 50 })
          .then((res) => res.items)
          .catch(() => []),
      ]);
      if (cancelled) return;
      setAppointments(appts.filter((a) => a.status !== "cancelled"));
      setOrders(ords.filter((o) => o.status !== "cancelled"));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, customer]);

  const reset = useCallback(() => {
    setConcept("");
    setAmount("");
    setCustomer(null);
    setTarget(NO_TARGET);
    setErrors({});
    setMinted(null);
    setWasReissue(false);
    setCopied(false);
    setSaving(false);
  }, []);

  function close() {
    onOpenChange(false);
    // Deferred so the closing animation does not play against a wiped body.
    setTimeout(reset, 200);
  }

  /**
   * Choosing what is being charged loads its registered amount and a concept.
   *
   * Both figures are of record, not guesses: a pedido's `total` is the frozen
   * sum of its lines, and an appointment's price comes off its service (which
   * `AppointmentOut` resolves server-side, so the panel does not have to fetch
   * the catalogue to price one booking). Both stay editable — a quote is not
   * always the list figure.
   */
  function pickTarget(value: string) {
    const next = decodeTarget(value);
    setTarget(next);
    if (next.kind === "appointment") {
      const appointment = appointments.find((a) => a.id === next.id);
      if (!appointment) return;
      if (appointment.service_price !== undefined) {
        setAmount(String(appointment.service_price));
      }
      if (!concept.trim()) {
        setConcept(
          appointment.service_name || `Cita ${formatDateTime(appointment.start)}`,
        );
      }
      return;
    }
    if (next.kind === "order") {
      const order = orders.find((o) => o.id === next.id);
      if (!order) return;
      setAmount(String(order.total));
      if (!concept.trim()) setConcept(`Pedido #${order.id}`);
    }
  }

  async function handleCreate() {
    const next: Record<string, string> = {};
    const value = Number(amount);
    if (!concept.trim()) next.concept = "Requerido";
    if (!amount.trim()) next.amount = "Requerido";
    else if (!Number.isFinite(value) || value <= 0)
      next.amount = "Debe ser mayor a cero";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const link = await createPaymentLink({
        concept: concept.trim(),
        amount: value,
        customer_id: customer?.id,
        appointment_id: target.kind === "appointment" ? target.id : undefined,
        order_id: target.kind === "order" ? target.id : undefined,
      });
      setMinted(link);
      setWasReissue(false);
      onCreated?.();
    } catch (e) {
      setErrors({
        _form: e instanceof Error ? e.message : "No se pudo crear el enlace",
      });
    } finally {
      setSaving(false);
    }
  }

  async function copyUrl() {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.url);
      setCopied(true);
      toast.success("Enlace copiado");
    } catch {
      // Clipboard is blocked on insecure origins and in some in-app browsers;
      // the input below is selectable, so this is a nudge, not a dead end.
      toast.error("No pudimos copiar el enlace. Selecciónalo y cópialo manualmente.");
    }
  }

  const targetItems = [
    { value: NONE, label: "Sin cita ni pedido" },
    ...appointments.map((a) => ({
      value: encodeTarget({ kind: "appointment", id: a.id }),
      label: `Cita · ${formatDateTime(a.start)}`,
    })),
    ...orders.map((o) => ({
      value: encodeTarget({ kind: "order", id: o.id }),
      label: `Pedido #${o.id} · ${money(o.total)}`,
    })),
  ];
  const hasTargets = appointments.length > 0 || orders.length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {/* Wider than the dialog default (`sm:max-w-sm`): this form pairs fields
          two-up, and at 384px every one of them was a full-width row with its
          help text wrapping onto three lines. */}
      <DialogContent className="sm:max-w-2xl">
        {minted ? (
          <>
            <DialogHeader>
              <DialogTitle>{wasReissue ? "Enlace nuevo" : "Enlace listo"}</DialogTitle>
              <DialogDescription>
                {wasReissue ? (
                  <>
                    Este cobro tiene un enlace nuevo:{" "}
                    <strong className="font-medium text-foreground">
                      el anterior dejó de funcionar
                    </strong>
                    . Envíaselo a tu cliente por WhatsApp.
                  </>
                ) : (
                  <>
                    Compártelo con {minted.customer_id ? customer?.name : "tu cliente"}{" "}
                    por WhatsApp. Es de un solo uso.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-border bg-surface p-3">
                <p className="text-xs text-muted-foreground">{minted.concept}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {money(minted.amount)}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paylink-url">Enlace de pago</Label>
                <div className="flex gap-2">
                  <Input
                    id="paylink-url"
                    readOnly
                    value={minted.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-mono text-xs"
                  />
                  <Button type="button" variant="outline" onClick={copyUrl}>
                    {copied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              </div>

              <p className="flex gap-2 text-xs text-muted-foreground">
                <TriangleAlert
                  className="size-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
                Este enlace se muestra una sola vez: no queda almacenado y no podemos
                recuperarlo. Si lo pierdes, genera uno nuevo.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cerrar
              </Button>
              <Button onClick={reset}>Crear otro</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nuevo enlace de pago</DialogTitle>
              <DialogDescription>
                Genera un enlace para cobrarle a un cliente por WhatsApp.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paylink-customer">Cliente (opcional)</Label>
                <CustomerCombobox
                  id="paylink-customer"
                  value={customer}
                  onChange={setCustomer}
                />
                <p className="text-xs text-muted-foreground">
                  Le precarga sus datos en el formulario de pago.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paylink-target">Cita o pedido (opcional)</Label>
                <Select
                  items={targetItems}
                  value={encodeTarget(target)}
                  onValueChange={(v) => pickTarget(v ?? NONE)}
                  disabled={!customer || !hasTargets}
                >
                  <SelectTrigger id="paylink-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targetItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {!customer
                    ? "Elige un cliente para ver sus citas y pedidos."
                    : !hasTargets
                      ? "Este cliente no tiene citas ni pedidos activos."
                      : "El pago queda ligado a lo que elijas."}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paylink-concept">Concepto</Label>
                <CharCountInput
                  id="paylink-concept"
                  max={120}
                  value={concept}
                  onChange={setConcept}
                  // Neutral on purpose: this SaaS runs barbershops, clinics,
                  // workshops and shops, and an example from one vertical reads
                  // as "this product is not for me" in all the others.
                  placeholder="¿Qué estás cobrando?"
                  aria-invalid={errors.concept ? true : undefined}
                  describedBy={errors.concept ? "paylink-concept-error" : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  Es lo que el cliente lee en la página de pago.
                </p>
                {errors.concept && (
                  <p
                    id="paylink-concept-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {errors.concept}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paylink-amount">Monto</Label>
                <Input
                  id="paylink-amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="15000"
                  aria-invalid={errors.amount ? true : undefined}
                  aria-describedby="paylink-amount-hint"
                />
                <p id="paylink-amount-hint" className="text-xs text-muted-foreground">
                  El monto queda fijado en el enlace: un cambio de precio posterior no
                  altera lo cotizado.
                </p>
                {errors.amount && (
                  <p
                    id="paylink-amount-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {errors.amount}
                  </p>
                )}
              </div>

              {errors._form && (
                <p role="alert" className="text-sm text-destructive sm:col-span-2">
                  {errors._form}
                </p>
              )}
            </div>

            <DialogFooter showCloseButton>
              <Button onClick={handleCreate} disabled={saving}>
                <Link2 className="size-4" />
                {saving ? "Generando…" : "Generar enlace"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
