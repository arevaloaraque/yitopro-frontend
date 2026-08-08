"use client";

import { useEffect, useState, type ReactElement } from "react";
import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Ban, Clock, History, Link2, StickyNote, User, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { listPayments } from "@/lib/api/payments";
import { useMoney } from "@/lib/business/use-money";
import type { Appointment } from "@/lib/types";

import type { EnrichedAppointment } from "./types";
import { isPastAppointment } from "./types";

interface AppointmentDetailPopoverProps {
  appointment: EnrichedAppointment;
  /**
   * Calendar mode: the event element becomes the trigger, and the popover
   * manages its own open state.
   */
  trigger?: ReactElement;
  /**
   * List mode: controlled open state over an EXTERNAL anchor. A table row
   * cannot host PopoverTrigger — its focus-guard <span> would render as an
   * illegal child of <tbody> and break hydration — so the row calls
   * `onOpenChange` itself and lends its element as the anchor instead.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  anchor?: PopoverPrimitive.Positioner.Props["anchor"];
  /** Placement against the anchor. Events read best beside the event
   *  (GCal); a full-width row reads best centred underneath it. */
  side?: PopoverPrimitive.Positioner.Props["side"];
  align?: PopoverPrimitive.Positioner.Props["align"];
  onCancel: (a: Appointment) => void;
  onReschedule: (a: Appointment) => void;
  onHistory: (a: Appointment) => void;
  onCreatePaymentLink: (a: EnrichedAppointment) => void;
}

// Singular, unlike the status TABS' labels ("Agendadas"): this card speaks
// about one appointment. Mirrors the list view's badge wording.
function statusBadge(status: Appointment["status"]) {
  switch (status) {
    case "scheduled":
      return { label: "Agendada", variant: "info" as const };
    case "cancelled":
      return { label: "Cancelada", variant: "destructive" as const };
    case "completed":
      return { label: "Completada", variant: "success" as const };
    case "no_show":
      return { label: "No asistió", variant: "secondary" as const };
  }
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The event card, Google Calendar style: click an appointment anywhere in the
 * agenda and its detail floats next to it instead of navigating away. The
 * actions that used to hide behind a per-event "…" menu live here, which is
 * what makes a single click enough for both reading and acting.
 */
export function AppointmentDetailPopover({
  appointment,
  trigger,
  open,
  onOpenChange,
  anchor,
  side = "right",
  align = "start",
  onCancel,
  onReschedule,
  onHistory,
  onCreatePaymentLink,
}: AppointmentDetailPopoverProps) {
  // A started appointment cannot be rescheduled or cancelled anymore — only
  // read (history) and charged (payment section below).
  const canChange = appointment.status === "scheduled" && !isPastAppointment(appointment);
  const badge = statusBadge(appointment.status);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* nativeButton=false: the trigger is a calendar event or a table row,
          not a <button> — Base UI adds role/tabIndex for keyboard parity. */}
      {trigger ? <PopoverTrigger render={trigger} nativeButton={false} /> : null}
      <PopoverContent side={side} align={align} anchor={anchor} className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {appointment.customerName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {appointment.serviceName}
            </p>
          </div>
          {/* GCal order: act on the left, dismiss at the far right. Every
              action closes the card — its dialog takes over from there. */}
          <div className="flex shrink-0 items-center gap-0.5">
            {canChange && (
              <>
                <PopoverClose
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Reagendar"
                      onClick={() => onReschedule(appointment)}
                    />
                  }
                >
                  <Clock className="size-3.5" />
                </PopoverClose>
                <PopoverClose
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Cancelar cita"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onCancel(appointment)}
                    />
                  }
                >
                  <Ban className="size-3.5" />
                </PopoverClose>
              </>
            )}
            <PopoverClose
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Ver historial"
                  onClick={() => onHistory(appointment)}
                />
              }
            >
              <History className="size-3.5" />
            </PopoverClose>
            <PopoverClose render={<Button variant="ghost" size="icon-xs" aria-label="Cerrar" />}>
              <X className="size-3.5" />
            </PopoverClose>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {appointment.created_by === "ai" && (
            <Badge
              variant="outline"
              className="border-accent/30 bg-accent/10 text-accent"
            >
              IA
            </Badge>
          )}
        </div>

        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-foreground">
              {formatDay(appointment.start)} · {formatTime(appointment.start)} –{" "}
              {formatTime(appointment.end)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <User className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-foreground">{appointment.professionalName}</span>
          </div>
          {appointment.notes && (
            <div className="flex items-start gap-2">
              <StickyNote className="mt-px size-3.5 shrink-0 text-muted-foreground" />
              <span className="whitespace-pre-line text-muted-foreground">
                {appointment.notes}
              </span>
            </div>
          )}
        </dl>

        <PaymentSection appointment={appointment} onCreatePaymentLink={onCreatePaymentLink} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * "¿Esta cita ya fue pagada?" — one bounded query on an indexed FK, asked
 * only when the card opens.
 *
 * A fetch failure reads as "unpaid" on purpose: the worst case is the
 * operator minting a second link for the same cita, which is recoverable —
 * hiding the button on a network hiccup would strand a charge that does
 * need to go out.
 */
function PaymentSection({
  appointment,
  onCreatePaymentLink,
}: {
  appointment: EnrichedAppointment;
  onCreatePaymentLink: (a: EnrichedAppointment) => void;
}) {
  const money = useMoney();
  const [state, setState] = useState<"loading" | "paid" | "unpaid">("loading");
  const [paidAmount, setPaidAmount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Deferred: keeps setState off the effect's synchronous path
    // (react-hooks/set-state-in-effect), the idiom used across the app.
    const t = setTimeout(() => {
      listPayments({ appointment_id: appointment.id }, { limit: 10 })
        .then((page) => {
          if (cancelled) return;
          const paid = page.items.find((p) => p.status === "paid");
          if (paid) {
            setPaidAmount(paid.amount);
            setState("paid");
          } else {
            setState("unpaid");
          }
        })
        .catch(() => {
          if (!cancelled) setState("unpaid");
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [appointment.id]);

  const canCharge =
    appointment.status === "scheduled" || appointment.status === "completed";

  return (
    <div className="mt-3 border-t border-border pt-3">
      {state === "loading" && (
        <p className="text-xs text-muted-foreground">Consultando pago…</p>
      )}
      {state === "paid" && (
        <div className="flex items-center gap-2">
          <Badge variant="success">Pagado</Badge>
          {paidAmount !== null && (
            <span className="text-xs text-muted-foreground">{money(paidAmount)}</span>
          )}
        </div>
      )}
      {state === "unpaid" && canCharge && (
        <PopoverClose
          render={
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => onCreatePaymentLink(appointment)}
            />
          }
        >
          <Link2 className="size-3.5" />
          Crear link de pago
          {appointment.service_price !== undefined &&
            ` · ${money(appointment.service_price)}`}
        </PopoverClose>
      )}
    </div>
  );
}
