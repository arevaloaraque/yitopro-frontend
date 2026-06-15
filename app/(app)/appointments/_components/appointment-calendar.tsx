"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Appointment } from "@/lib/types";
import { cn } from "@/lib/utils";

import { AppointmentActions } from "./appointment-actions";
import type { StatusFilter } from "./status-tabs";
import type { EnrichedAppointment } from "./types";

type CalendarView = "day" | "week" | "month";

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8..20
const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
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
  appointments: EnrichedAppointment[];
  statusFilter: StatusFilter;
  onCancel: (a: Appointment) => void;
  onReschedule: (a: Appointment) => void;
  onHistory: (a: Appointment) => void;
}

function statusBarColor(status: Appointment["status"]): string {
  switch (status) {
    case "scheduled":
      return "border-l-primary bg-primary/5";
    case "cancelled":
      return "border-l-destructive/50 bg-destructive/5";
    case "rescheduled":
      return "border-l-accent bg-accent/5";
    case "completed":
      return "border-l-muted-foreground/30 bg-muted/30";
  }
}

export function AppointmentCalendar({
  appointments,
  statusFilter,
  onCancel,
  onReschedule,
  onHistory,
}: AppointmentCalendarProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [cursor, setCursor] = useState(() => new Date());

  const filtered = useMemo(() => {
    if (statusFilter === "all") return appointments;
    return appointments.filter((a) => a.status === statusFilter);
  }, [appointments, statusFilter]);

  function navigate(delta: number, unit: "day" | "week" | "month") {
    setCursor((prev) => {
      const next = new Date(prev);
      if (unit === "day") next.setDate(next.getDate() + delta);
      else if (unit === "week") next.setDate(next.getDate() + delta * 7);
      else next.setMonth(next.getMonth() + delta);
      return next;
    });
  }

  function goToday() {
    setCursor(new Date());
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

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() =>
              navigate(
                -1,
                view === "day" ? "day" : view === "week" ? "week" : "month",
              )
            }
            aria-label="Anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="min-w-48 text-center text-sm font-semibold text-foreground">
            {formatDayHeader(
              view === "month" ? monthStart : view === "week" ? weekStart : cursor,
              view,
            )}
          </h2>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() =>
              navigate(
                1,
                view === "day" ? "day" : view === "week" ? "week" : "month",
              )
            }
            aria-label="Siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="xs" onClick={goToday}>
            Hoy
          </Button>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setView(opt.value)}
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

      {/* Day names row */}
      <div
        className={cn(
          "grid border-b border-border bg-muted/30",
          view === "day"
            ? "grid-cols-[3rem_1fr]"
            : "grid-cols-7",
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
          appointments={filtered}
          onCancel={onCancel}
          onReschedule={onReschedule}
          onHistory={onHistory}
        />
      ) : (
        <TimeGrid
          view={view}
          cursor={cursor}
          weekStart={weekStart}
          appointments={filtered}
          onCancel={onCancel}
          onReschedule={onReschedule}
          onHistory={onHistory}
        />
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
}: {
  view: "day" | "week";
  cursor: Date;
  weekStart: Date;
  appointments: EnrichedAppointment[];
  onCancel: (a: Appointment) => void;
  onReschedule: (a: Appointment) => void;
  onHistory: (a: Appointment) => void;
}) {
  const days = view === "day" ? [cursor] : Array.from({ length: 7 }, (_, i) => {
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
    const top = ((startMinutes - 480) / 60) * 64; // 8:00 → 0px
    const height = Math.max(((endMinutes - startMinutes) / 60) * 64, 32);
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
              className="flex h-16 items-start justify-end pr-2 pt-0 text-xs text-muted-foreground"
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
                <div
                  key={h}
                  className="h-16 border-b border-border/50"
                />
              ))}
              {/* Appointments */}
              {dayApps.map((apt) => {
                const { top, height } = getPosition(apt.start, apt.end);
                const timeLabel = `${new Date(apt.start).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} – ${new Date(apt.end).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`;
                return (
                  <div
                    key={apt.id}
                    className={cn(
                      "absolute left-0.5 right-0.5 z-10 overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-xs leading-tight",
                      statusBarColor(apt.status),
                    )}
                    style={{ top: `${top}px`, height: `${height}px` }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-medium">
                        {apt.customerName}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {apt.created_by === "ai" && (
                          <Badge variant="outline" className="h-4 px-1 text-[0.625rem] leading-none">
                            IA
                          </Badge>
                        )}
                        <AppointmentActions
                          appointment={apt}
                          onCancel={onCancel}
                          onReschedule={onReschedule}
                          onHistory={onHistory}
                        />
                      </div>
                    </div>
                    <p className="truncate text-muted-foreground">
                      {apt.serviceName}
                    </p>
                    <p className="text-muted-foreground">{timeLabel}</p>
                  </div>
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
}: {
  days: Date[];
  monthStart: Date;
  appointments: EnrichedAppointment[];
  onCancel: (a: Appointment) => void;
  onReschedule: (a: Appointment) => void;
  onHistory: (a: Appointment) => void;
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
              "min-h-24 border-b border-r border-border px-1.5 py-1",
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
                <Tooltip key={apt.id}>
                  <TooltipTrigger>
                    <div
                      className={cn(
                        "flex cursor-default items-center gap-1 truncate rounded px-1 py-0.5 text-[0.625rem] leading-none",
                        statusBarColor(apt.status),
                      )}
                    >
                      <span className="truncate font-medium">
                        {apt.customerName}
                      </span>
                      {apt.created_by === "ai" && (
                        <span className="shrink-0 rounded border border-border px-0.5 text-[0.5rem] text-muted-foreground">
                          IA
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{apt.customerName}</p>
                        <p className="text-muted-foreground">{apt.serviceName}</p>
                        <p className="text-muted-foreground">
                          {new Date(apt.start).toLocaleTimeString("es-CL", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <AppointmentActions
                        appointment={apt}
                        onCancel={onCancel}
                        onReschedule={onReschedule}
                        onHistory={onHistory}
                      />
                    </div>
                  </TooltipContent>
                </Tooltip>
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
