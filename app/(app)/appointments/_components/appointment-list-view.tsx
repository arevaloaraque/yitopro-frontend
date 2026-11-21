"use client";

import { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ListFooter } from "@/components/ui/list-footer";
import { RowOpenButton } from "@/components/ui/row-open-button";
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
import type { EnrichedAppointment } from "./types";
import { timeOnly } from "@/lib/format/date";

interface AppointmentListViewProps {
  /** Ya filtradas en el servidor: aquí no se vuelve a filtrar por estado. */
  appointments: EnrichedAppointment[];
  /** `count` del servidor: cuántas citas tiene el filtro, no cuántas se bajaron. */
  total: number;
  loading: boolean;
  onLoadMore: () => void;
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
  total,
  loading,
  onLoadMore,
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

  // La tarjeta se ancla a la FILA, no al botón que la abre: centrada bajo la
  // fila entera es donde ya aparecía al hacer click, y anclarla al botón la
  // pegaría al borde izquierdo. `RowOpenButton` no entrega el evento (a
  // propósito: quien la use no debería depender del DOM), así que cada fila
  // deja aquí su elemento.
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const openDetail = useCallback((apt: EnrichedAppointment) => {
    const row = rowRefs.current.get(apt.id);
    if (row) setSelected({ apt, anchor: row });
  }, []);

  // CITAS-09 revisado: se muestra el orden que manda el servidor
  // (`start_datetime, id` ascendente) y NO se reordena en el navegador. El
  // reorden descendente existía para que la primera pantalla no fuera el
  // historial más viejo, pero con paginación real es incompatible: «Cargar más»
  // trae citas MÁS NUEVAS, que al reordenar saltan arriba de las que ya estaban
  // y mueven la fila que el operador está leyendo. Mostrar lo último primero
  // necesita que el backend acepte un `ordering` (como ya hace `/customers/`);
  // hasta entonces el filtro «Agendadas» deja la lista en el orden útil: las
  // próximas, en orden cronológico.
  // RESUELTO: `/api/appointments/` ya acepta `ordering`, y la página pide
  // `-start_datetime` para esta vista. La tabla sigue pintando el orden que llega
  // sin reordenar nada, que es la única forma compatible con paginar.

  return (
    <>
      <Table>
        <TableHeader>
          {/* Las columnas se caen por breakpoint en vez de sobrevivir tras un
              scroll horizontal: a 375px el scroll dejaba «Servicio | Cliente»
              en pantalla y empujaba fuera Estado y las acciones, que es justo
              para lo que se abre la tabla. Servicio no se va nunca porque lleva
              el único acceso por teclado al detalle; Estado tampoco, porque es
              lo que la fila existe para comunicar. */}
          <TableRow>
            <TableHead>Servicio</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="hidden lg:table-cell">Profesional</TableHead>
            <TableHead className="hidden w-36 sm:table-cell">Fecha</TableHead>
            <TableHead className="hidden w-32 md:table-cell">Hora</TableHead>
            <TableHead className="w-28">Estado</TableHead>
            <TableHead className="hidden w-20 xl:table-cell">Origen</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.map((apt) => {
            const s = statusBadge(apt.status);
            return (
              <TableRow
                key={apt.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(apt.id, el);
                  else rowRefs.current.delete(apt.id);
                }}
                className="cursor-pointer"
                // Sin `tabIndex` ni `onKeyDown`: la fila que escuchaba el
                // teclado hacía `preventDefault()` y mataba el click nativo que
                // Enter dispara sobre los botones de dentro — se tabulaba hasta
                // «Ver historial», se pulsaba Enter y se abría el detalle.
                // Queda solo el click, como comodidad de ratón.
                onClick={() => openDetail(apt)}
              >
                <TableCell className="font-medium">
                  <RowOpenButton
                    label={`Ver detalle de la cita de ${apt.customerName}: ${apt.serviceName}`}
                    onOpen={() => openDetail(apt)}
                  >
                    {apt.serviceName}
                  </RowOpenButton>
                  {/* Fecha y hora tienen columna propia desde `sm`; por debajo
                      se leen aquí, porque una cita sin cuándo no es una cita. */}
                  <span className="block text-xs whitespace-normal text-muted-foreground tabular-nums sm:hidden">
                    {formatDate(apt.start)} · {timeOnly(apt.start)}
                  </span>
                </TableCell>
                <TableCell>{apt.customerName}</TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {apt.professionalName}
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                  {formatDate(apt.start)}
                </TableCell>
                <TableCell className="hidden tabular-nums md:table-cell">
                  {timeOnly(apt.start)} – {timeOnly(apt.end)}
                </TableCell>
                <TableCell>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </TableCell>
                <TableCell className="hidden xl:table-cell">
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
          })}
        </TableBody>
      </Table>

      {/* El pie dice «Mostrando 25 de 4.312» con el `count` del servidor: antes
          la lista bajaba lo que cupiera en una respuesta y no había forma de
          saber que faltaban citas. */}
      <div className="mt-4">
        <ListFooter
          shown={appointments.length}
          total={total}
          loading={loading}
          onLoadMore={onLoadMore}
          noun="cita"
          nounPlural="citas"
        />
      </div>

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
