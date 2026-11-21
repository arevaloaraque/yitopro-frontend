"use client";

import { useMemo } from "react";
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import type { Appointment } from "@/lib/types";
import { cn } from "@/lib/utils";

import { AppointmentDetailPopover } from "./appointment-detail-popover";
import type { EnrichedAppointment } from "./types";
import { timeOnly } from "@/lib/format/date";

export type CalendarView = "day" | "week" | "month";

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

/** Cómo se nombra la ventana visible en la rama de vacío. */
const WINDOW_NOUN: Record<CalendarView, string> = {
  day: "este día",
  week: "esta semana",
  month: "este mes",
};

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8..20
const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * `YYYY-MM-DD` del día LOCAL. No sirve `toISOString().slice(0,10)`: en cualquier
 * offset negativo (todo Chile) devuelve el día anterior para las horas de la
 * tarde, o sea que la ventana pedida se corría un día entero.
 */
function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * La ventana visible (día/semana/mes) traducida a días de calendario para el
 * backend (`date_from`/`date_to`, inclusivos).
 *
 * Es lo que permite que el calendario pida EL PERÍODO que dibuja en vez de bajar
 * el historial completo del negocio y navegarlo en memoria: con el `limit` por
 * defecto de 100 del servidor, ese historial completo llegaba recortado y la
 * agenda se veía entera estando incompleta.
 *
 * Se pide **un día de más a cada lado** a propósito: el backend interpreta estos
 * días en la zona horaria del NEGOCIO y la grilla se dibuja en la del NAVEGADOR,
 * así que con el operador en otro huso la cita del borde (23:30 del domingo, por
 * ejemplo) cae fuera del rango y ese día aparece vacío. Sobran filas, nunca
 * faltan; el filtro por ventana visible de más abajo descarta lo que no toca
 * dibujar.
 */
export function calendarWindow(
  view: CalendarView,
  cursor: Date,
): { date_from: string; date_to: string } {
  let from: Date;
  let to: Date;
  if (view === "day") {
    from = new Date(cursor);
    to = new Date(cursor);
  } else if (view === "week") {
    from = startOfWeek(cursor);
    to = new Date(from);
    to.setDate(to.getDate() + 6);
  } else {
    from = startOfMonth(cursor);
    // Día 0 del mes siguiente = último día de este mes.
    to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
  }
  from.setDate(from.getDate() - 1);
  to.setDate(to.getDate() + 1);
  return { date_from: ymd(from), date_to: ymd(to) };
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

function formatMonthYear(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDayHeader(d: Date, view: CalendarView): string {
  if (view === "day") {
    return d.toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }
  if (view === "week") {
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    const sameMonth = d.getMonth() === end.getMonth();
    return sameMonth
      ? `${d.getDate()} – ${end.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      : `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${d.getFullYear()}`;
  }
  return formatMonthYear(d);
}

interface AppointmentCalendarProps {
  /** Ya filtradas en el servidor: aquí no se vuelve a filtrar por estado. */
  appointments: EnrichedAppointment[];
  /**
   * Rango y posición son CONTROLADOS por la página: la ventana visible es lo que
   * define qué citas se piden (`date_from`/`date_to`), y un estado escondido acá
   * dentro dejaba a la página adivinando qué período dibujar.
   */
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  cursor: Date;
  onCursorChange: (d: Date) => void;
  /** Hay algún filtro puesto: decide qué dice la rama de vacío. */
  filtersActive: boolean;
  onClearFilters: () => void;
  onCancel: (a: Appointment) => void;
  onReschedule: (a: Appointment) => void;
  onHistory: (a: Appointment) => void;
  onCreatePaymentLink: (a: EnrichedAppointment) => void;
}

function statusBarColor(status: Appointment["status"]): string {
  switch (status) {
    case "scheduled":
      return "border-l-primary bg-primary/5";
    case "cancelled":
      return "border-l-destructive/50 bg-destructive/5";
    case "completed":
      return "border-l-muted-foreground/30 bg-muted/30";
    case "no_show":
      return "border-l-warning/50 bg-warning/5";
  }
}

export function AppointmentCalendar({
  appointments,
  view,
  onViewChange,
  cursor,
  onCursorChange,
  filtersActive,
  onClearFilters,
  onCancel,
  onReschedule,
  onHistory,
  onCreatePaymentLink,
}: AppointmentCalendarProps) {
  function navigate(delta: number, unit: "day" | "week" | "month") {
    const next = new Date(cursor);
    if (unit === "day") next.setDate(next.getDate() + delta);
    else if (unit === "week") next.setDate(next.getDate() + delta * 7);
    else next.setMonth(next.getMonth() + delta);
    onCursorChange(next);
  }

  function goToday() {
    onCursorChange(new Date());
  }

  const weekStart = useMemo(() => startOfWeek(cursor), [cursor]);
  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);

  // Day names for week/month views
  const monthDays = useMemo(() => {
    const firstDay = monthStart.getDay();
    const mondayOffset = firstDay === 0 ? -6 : 1 - firstDay;
    const start = new Date(monthStart);
    start.setDate(start.getDate() + mondayOffset);

    const daysInMonth = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
    ).getDate();

    const days: Date[] = [];
    const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [monthStart]);

  // CITAS-04: la rama de vacío se calcula sobre la VENTANA VISIBLE, no sobre la
  // lista completa. El calendario no dibujaba ninguna: con un filtro sin
  // coincidencias la lista decía «sin citas» y el calendario mostraba una
  // grilla muda, o sea las dos vistas contestaban distinto a la misma pregunta.
  // Y aunque haya citas cargadas, una semana vacía tiene que decirlo.
  // Sigue haciendo falta con el fetch por período: la ventana que se pide lleva
  // un día extra a cada lado por la zona horaria del negocio (ver
  // `calendarWindow`), y esos días no se dibujan.
  const visible = useMemo(() => {
    if (view === "month") {
      return appointments.filter((a) => {
        const start = new Date(a.start);
        return (
          start.getFullYear() === monthStart.getFullYear() &&
          start.getMonth() === monthStart.getMonth()
        );
      });
    }
    if (view === "day") {
      return appointments.filter((a) => isSameDay(new Date(a.start), cursor));
    }
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return appointments.filter((a) => {
      const start = new Date(a.start);
      return start >= weekStart && start < weekEnd;
    });
  }, [appointments, view, cursor, weekStart, monthStart]);

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() =>
              navigate(-1, view === "day" ? "day" : view === "week" ? "week" : "month")
            }
            aria-label="Anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="min-w-0 text-center text-sm font-semibold text-foreground sm:min-w-48">
            {formatDayHeader(
              view === "month" ? monthStart : view === "week" ? weekStart : cursor,
              view,
            )}
          </h2>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() =>
              navigate(1, view === "day" ? "day" : view === "week" ? "week" : "month")
            }
            aria-label="Siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="xs" onClick={goToday}>
            Hoy
          </Button>
        </div>
        <div
          role="group"
          aria-label="Rango del calendario"
          className="flex items-center gap-1 rounded-lg bg-muted p-0.5"
        >
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              // CITAS-08: el fondo claro es la ÚNICA señal de cuál está puesto,
              // y un lector de pantalla no la ve.
              aria-pressed={view === opt.value}
              onClick={() => onViewChange(opt.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                view === opt.value
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        // Sin la grilla: una rejilla de horas vacía se lee como «esto no cargó».
        // La cabecera se queda, que es por donde se sale a otra semana.
        <EmptyState
          className="border-0 bg-transparent py-14"
          icon={CalendarX}
          title={filtersActive ? "Sin coincidencias" : "Sin citas"}
          description={
            filtersActive
              ? `Ninguna cita coincide con los filtros en ${WINDOW_NOUN[view]}.`
              : `No hay citas agendadas en ${WINDOW_NOUN[view]}.`
          }
          action={
            filtersActive ? (
              <Button variant="outline" onClick={onClearFilters}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Day names row */}
          <div
            className={cn(
              "grid border-b border-border bg-muted/30",
              view === "day" ? "grid-cols-[3rem_1fr]" : "grid-cols-7",
            )}
          >
            {view === "day" ? (
              <>
                <div />
                <div className="px-3 py-1.5 text-center text-xs font-medium text-muted-foreground">
                  {cursor.toLocaleDateString("es-CL", { weekday: "long" })}
                </div>
              </>
            ) : (
              DAY_NAMES.map((name) => (
                <div
                  key={name}
                  className="px-3 py-1.5 text-center text-xs font-medium text-muted-foreground"
                >
                  {name}
                </div>
              ))
            )}
          </div>

          {/* Grid body */}
          {view === "month" ? (
            <MonthGrid
              days={monthDays}
              monthStart={monthStart}
              appointments={visible}
              onCancel={onCancel}
              onReschedule={onReschedule}
              onHistory={onHistory}
              onCreatePaymentLink={onCreatePaymentLink}
            />
          ) : (
            <TimeGrid
              view={view}
              cursor={cursor}
              weekStart={weekStart}
              appointments={visible}
              onCancel={onCancel}
              onReschedule={onReschedule}
              onHistory={onHistory}
              onCreatePaymentLink={onCreatePaymentLink}
            />
          )}
        </>
      )}
    </div>
  );
}

function TimeGrid({
  view,
  cursor,
  weekStart,
  appointments,
  onCancel,
  onReschedule,
  onHistory,
  onCreatePaymentLink,
}: {
  view: "day" | "week";
  cursor: Date;
  weekStart: Date;
  appointments: EnrichedAppointment[];
  onCancel: (a: Appointment) => void;
  onReschedule: (a: Appointment) => void;
  onHistory: (a: Appointment) => void;
  onCreatePaymentLink: (a: EnrichedAppointment) => void;
}) {
  const days =
    view === "day"
      ? [cursor]
      : Array.from({ length: 7 }, (_, i) => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + i);
          return d;
        });

  function getAppointmentsForDay(day: Date) {
    return appointments.filter((a) => {
      const start = new Date(a.start);
      return isSameDay(start, day);
    });
  }

  function getPosition(start: string, end: string) {
    const s = new Date(start);
    const e = new Date(end);
    const startMinutes = s.getHours() * 60 + s.getMinutes();
    const endMinutes = e.getHours() * 60 + e.getMinutes();
    const top = ((startMinutes - 480) / 60) * 80; // 8:00 → 0px
    const height = Math.max(((endMinutes - startMinutes) / 60) * 80, 46);
    return { top, height };
  }

  return (
    <div className="overflow-auto">
      <div
        className={cn(
          "grid",
          view === "day" ? "grid-cols-[3rem_1fr]" : "grid-cols-[3rem_repeat(7,1fr)]",
        )}
      >
        {/* Time labels */}
        <div>
          {HOURS.map((h) => (
            <div
              key={h}
              className="flex h-20 items-start justify-end pt-0 pr-2 text-xs text-muted-foreground"
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {/* Day columns */}
        {days.map((day, dayIdx) => {
          const dayApps = getAppointmentsForDay(day);
          return (
            <div
              key={dayIdx}
              className={cn(
                "relative border-l border-border",
                isToday(day) && "bg-primary/3",
              )}
            >
              {/* Hour grid lines */}
              {HOURS.map((h) => (
                <div key={h} className="h-20 border-b border-border/50" />
              ))}
              {/* Appointments — the whole event is the detail trigger; its
                  actions live inside the card, Google Calendar style. */}
              {dayApps.map((apt) => {
                const { top, height } = getPosition(apt.start, apt.end);
                const showService = height >= 64;
                const timeLabel = `${timeOnly(apt.start)} – ${timeOnly(apt.end)}`;
                return (
                  <AppointmentDetailPopover
                    key={apt.id}
                    appointment={apt}
                    onCancel={onCancel}
                    onReschedule={onReschedule}
                    onHistory={onHistory}
                    onCreatePaymentLink={onCreatePaymentLink}
                    trigger={
                      <div
                        title={`${apt.customerName} · ${apt.serviceName} · ${timeLabel}`}
                        className={cn(
                          "absolute right-0.5 left-0.5 z-10 flex cursor-pointer flex-col gap-0.5 overflow-hidden rounded-md border-l-2 px-1.5 py-1 text-left text-xs leading-tight",
                          statusBarColor(apt.status),
                        )}
                        style={{ top: `${top}px`, height: `${height}px` }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="truncate font-medium">
                            {apt.customerName}
                          </span>
                          {apt.created_by === "ai" && (
                            <Badge
                              variant="outline"
                              className="-mt-0.5 -mr-1 h-4 shrink-0 px-1 text-[0.625rem] leading-none"
                            >
                              IA
                            </Badge>
                          )}
                        </div>
                        <span className="truncate text-[0.6875rem] text-muted-foreground">
                          {timeLabel}
                        </span>
                        {showService && (
                          <span className="truncate text-muted-foreground">
                            {apt.serviceName}
                          </span>
                        )}
                      </div>
                    }
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({
  days,
  monthStart,
  appointments,
  onCancel,
  onReschedule,
  onHistory,
  onCreatePaymentLink,
}: {
  days: Date[];
  monthStart: Date;
  appointments: EnrichedAppointment[];
  onCancel: (a: Appointment) => void;
  onReschedule: (a: Appointment) => void;
  onHistory: (a: Appointment) => void;
  onCreatePaymentLink: (a: EnrichedAppointment) => void;
}) {
  return (
    <div className="grid grid-cols-7">
      {days.map((day, idx) => {
        const inMonth = day.getMonth() === monthStart.getMonth();
        const dayApps = appointments.filter((a) => {
          const start = new Date(a.start);
          return isSameDay(start, day);
        });

        return (
          <div
            key={idx}
            className={cn(
              "min-h-24 border-r border-b border-border px-1.5 py-1",
              !inMonth && "bg-muted/20",
              isToday(day) && "bg-primary/3",
            )}
          >
            <span
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
                isToday(day) && "bg-primary text-primary-foreground",
                !inMonth && "text-muted-foreground/40",
                inMonth && !isToday(day) && "text-foreground",
              )}
            >
              {day.getDate()}
            </span>
            <div className="mt-0.5 space-y-0.5">
              {dayApps.slice(0, 3).map((apt) => (
                <AppointmentDetailPopover
                  key={apt.id}
                  appointment={apt}
                  onCancel={onCancel}
                  onReschedule={onReschedule}
                  onHistory={onHistory}
                  onCreatePaymentLink={onCreatePaymentLink}
                  trigger={
                    <div
                      className={cn(
                        "flex cursor-pointer items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[0.625rem] leading-none",
                        statusBarColor(apt.status),
                      )}
                    >
                      <span className="truncate font-medium">{apt.customerName}</span>
                      {apt.created_by === "ai" && (
                        <span className="shrink-0 rounded border border-border px-0.5 text-[0.5rem] text-muted-foreground">
                          IA
                        </span>
                      )}
                    </div>
                  }
                />
              ))}
              {dayApps.length > 3 && (
                <p className="px-1 text-[0.625rem] text-muted-foreground">
                  +{dayApps.length - 3} más
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
