"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
import { getPayment, type Payment, type PaymentDetail } from "@/lib/api/payments";
import { formatDateTime } from "@/lib/format/date";
import { formatPrice } from "@/lib/utils";

type DetailState = "idle" | "loading" | "error" | "ready";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm wrap-break-word text-foreground">{children}</dd>
    </div>
  );
}

/** A metadata value is whatever the gateway sent — rendered, never interpreted. */
function metadataValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Read-only detail of a final payment (paid/rejected), opened from the table row.
 *
 * The list row already carries most of what is shown; the fetch adds what the
 * list deliberately omits — who paid (name, email, document), when the money
 * settled, and the gateway's raw metadata for reconciliation.
 */
export function PaymentDetailDialog({
  row,
  open,
  onOpenChange,
}: {
  row: Payment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<DetailState>("idle");
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A slow response must not land after the dialog closed or the row changed.
  const reqRef = useRef(0);

  const load = useCallback(() => {
    if (!row) return;
    const reqId = ++reqRef.current;
    setState("loading");
    setError(null);
    getPayment(row.id)
      .then((d) => {
        if (reqId !== reqRef.current) return;
        setDetail(d);
        setState("ready");
      })
      .catch((e) => {
        if (reqId !== reqRef.current) return;
        setError(e instanceof Error ? e.message : "Error al cargar el detalle");
        setState("error");
      });
  }, [row]);

  // Deferred like the page's own loader: setting state synchronously from the
  // effect body cascades renders (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open || !row) return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [open, row, load]);

  // `?? {}`: deploy-order insurance — a backend without the PaymentOut
  // extension omits the field, and Object.entries(undefined) is a TypeError.
  const metadataEntries = detail ? Object.entries(detail.provider_metadata ?? {}) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Same layout as the order detail dialog: three grid rows
          (`auto / minmax(0,1fr) / auto`) so ONLY the middle scrolls, and
          `max-h-[85vh]` keeps a long metadata list inside the viewport. */}
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalle del pago</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {row?.reference ?? ""}
          </DialogDescription>
        </DialogHeader>

        {/* `min-h-0` lets this grid row shrink below its content so it, and
            only it, scrolls. */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          {row && (
            <>
              {/* What the row already knows. */}
              <div className="rounded-xl border border-border/40 p-3">
                <dl className="divide-y divide-border/30">
                  <Field label="Cliente">
                    {row.customer_name || (
                      <span className="text-muted-foreground">Sin cliente</span>
                    )}
                  </Field>
                  <Field label="Monto">
                    <span className="font-medium tabular-nums">
                      {formatPrice(row.amount, row.currency)}
                    </span>
                  </Field>
                  <Field label="Medio">{row.method_label || "—"}</Field>
                  <Field label="Proveedor">
                    {row.channel_name ? (
                      <>
                        {row.channel_name}
                        <span className="block text-xs text-muted-foreground">
                          {row.provider_name}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </Field>
                  <Field label="Estado">
                    <PaymentStatusBadge status={row.status} />
                  </Field>
                  <Field label="Creado">{formatDateTime(row.created_at)}</Field>
                </dl>
              </div>

              {state === "loading" && (
                <div className="space-y-2 rounded-xl border border-border/40 p-3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              )}

              {state === "error" && (
                <div className="space-y-2 rounded-xl border border-border/40 p-3">
                  <p className="text-xs text-destructive">
                    {error ?? "Error al cargar el detalle"}
                  </p>
                  <Button variant="outline" size="sm" onClick={load}>
                    Reintentar
                  </Button>
                </div>
              )}

              {state === "ready" && detail && (
                <>
                  <div className="rounded-xl border border-border/40 p-3">
                    <p className="mb-1 text-sm font-medium text-foreground">
                      Datos del pagador
                    </p>
                    <dl className="divide-y divide-border/30">
                      <Field label="Nombre">{detail.shopper_name || "—"}</Field>
                      <Field label="RUT / documento">
                        {detail.shopper_doc_number || "—"}
                      </Field>
                      <Field label="Email">{detail.shopper_email || "—"}</Field>
                      <Field label="Pagado">
                        {detail.paid_at ? formatDateTime(detail.paid_at) : "—"}
                      </Field>
                      <Field label="Expira">{formatDateTime(detail.expires_at)}</Field>
                    </dl>
                  </div>

                  {metadataEntries.length > 0 && (
                    <div className="rounded-xl border border-border/40 p-3">
                      <p className="mb-1 text-sm font-medium text-foreground">
                        Datos de la pasarela
                      </p>
                      <dl className="divide-y divide-border/30">
                        {metadataEntries.map(([key, value]) => (
                          <Field key={key} label={key}>
                            <span className="font-mono text-xs">
                              {metadataValue(value)}
                            </span>
                          </Field>
                        ))}
                      </dl>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
