"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Appointment } from "@/lib/types";

import { AppointmentActions } from "./appointment-actions";
import { AppointmentDetailPopover } from "./appointment-detail-popover";
import { statusLabel, type StatusFilter } from "./status-tabs";
import type { EnrichedAppointment } from "./types";

interface AppointmentListViewProps {
  appointments: EnrichedAppointment[];
  statusFilter: StatusFilter;
  onCancel: (a: Appointment) => void;
  onReschedule: (a: Appointment) => void;
  onHistory: (a: Appointment) => void;
  onCreatePaymentLink: (a: EnrichedAppointment) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

export function AppointmentListView({
  appointments,
  statusFilter,
  onCancel,
  onReschedule,
  onHistory,
  onCreatePaymentLink,
}: AppointmentListViewProps) {
  // One controlled popover for the whole table: the row cannot BE the
  // PopoverTrigger (its focus-guard <span> would land inside <tbody> and
  // break hydration), so the row reports clicks and lends its element as
  // the anchor instead.
  const [selected, setSelected] = useState<{
    apt: EnrichedAppointment;
    anchor: HTMLElement;
  } | null>(null);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return appointments;
    return appointments.filter((a) => a.status === statusFilter);
  }, [appointments, statusFilter]);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Servicio</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Profesional</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Hora</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                Sin citas
                {statusFilter !== "all" ? ` en estado "${statusLabel(statusFilter)}"` : ""}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((apt) => {
              const s = statusBadge(apt.status);
              return (
                <TableRow
                  key={apt.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={(e) => setSelected({ apt, anchor: e.currentTarget })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected({ apt, anchor: e.currentTarget });
                    }
                  }}
                >
                  <TableCell className="font-medium">{apt.serviceName}</TableCell>
                  <TableCell>{apt.customerName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {apt.professionalName}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDate(apt.start)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatTime(apt.start)} – {formatTime(apt.end)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {apt.created_by === "ai" ? (
                      <Badge
                        variant="outline"
                        className="border-accent/30 bg-accent/10 text-accent"
                      >
                        IA
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Manual</span>
                    )}
                  </TableCell>
                  {/* The row opens the popover; the "…" menu must not, so its
                      clicks stop here. */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <AppointmentActions
                      appointment={apt}
                      onCancel={onCancel}
                      onReschedule={onReschedule}
                      onHistory={onHistory}
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {selected && (
        <AppointmentDetailPopover
          appointment={selected.apt}
          open
          onOpenChange={(open) => !open && setSelected(null)}
          anchor={selected.anchor}
          side="bottom"
          align="center"
          onCancel={onCancel}
          onReschedule={onReschedule}
          onHistory={onHistory}
          onCreatePaymentLink={onCreatePaymentLink}
        />
      )}
    </>
  );
}
