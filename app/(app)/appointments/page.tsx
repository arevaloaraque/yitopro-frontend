"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Plus, List } from "lucide-react";

import {
  cancelAppointment,
  createAppointment,
  listAppointments,
  listProfessionals,
  listServices,
  rescheduleAppointment,
  type ListAppointmentsParams,
} from "@/lib/api";
import { subscribeToEvents } from "@/lib/sse";
import type {
  Appointment,
  Paginated,
  Professional,
  Service,
  SSEEvent,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterBar } from "@/components/filters/filter-bar";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { PaymentLinkDialog } from "@/components/payments/payment-link-dialog";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { cn } from "@/lib/utils";

import {
  AppointmentCalendar,
  calendarWindow,
  type CalendarView,
} from "./_components/appointment-calendar";
import { AppointmentListView } from "./_components/appointment-list-view";
import { CancelDialog } from "./_components/cancel-dialog";
import { CreateDialog } from "./_components/create-dialog";
import { HistoryDialog } from "./_components/history-dialog";
import { RescheduleDialog } from "./_components/reschedule-dialog";
import { isStatusFilter, StatusTabs } from "./_components/status-tabs";
import type { EnrichedAppointment } from "./_components/types";

/** Filas por página de la LISTA. El calendario no pagina: pide su período. */
const PAGE_SIZE = 25;

/**
 * Tope del calendario. La ventana visible ya acota lo que se pide, pero un mes de
 * un tenant grande puede pasar de las 100 filas que el servidor devuelve por
 * defecto, y una grilla a la que le faltan citas se ve idéntica a una completa.
 * Con un tope propio y `count` a la vista, el recorte —si llega— se anuncia.
 */
const CALENDAR_LIMIT = 500;

function AppointmentsPageContent() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  /** `count` del servidor para el filtro vigente (no cuántas se bajaron). */
  const [count, setCount] = useState(0);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  // Separa «todavía no cargó nunca» de «está refrescando»: lo primero merece
  // esqueleto de página entera, lo segundo no puede hacer desaparecer los
  // filtros que el operador acaba de tocar.
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState(false);

  // CITAS-05: los filtros viven en la URL, así que una agenda filtrada se
  // comparte por chat y sobrevive un reload. El hook preserva el `?id=` del
  // deep-link de historial, que también es contrato de esta pantalla.
  const [filters, setFilters] = useUrlFilters({
    status: "all",
    pro: "all",
    svc: "all",
    view: "calendar",
  });
  // Lo que venga en la URL se normaliza antes de usarse: es entrada del usuario.
  const viewMode = filters.view === "list" ? "list" : "calendar";
  const status = isStatusFilter(filters.status) ? filters.status : "all";

  // El rango del calendario vive ACÁ y no dentro del componente: es lo que
  // decide qué citas se piden (`date_from`/`date_to`), así que la página no
  // puede enterarse de la ventana después de haber hecho el fetch.
  // CITAS-11: en un teléfono la semana entra a 7 columnas de ~45px, donde no
  // cabe ni el nombre del cliente. Se decide UNA vez al montar y no en un
  // listener de `resize`: cambiar de vista sola mientras el operador navega le
  // pisaría su elección.
  const [calendarView, setCalendarView] = useState<CalendarView>(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "day" : "week",
  );
  const [cursor, setCursor] = useState(() => new Date());

  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  // The appointment the detail popover is charging, or null. The dialog
  // remounts per appointment (key below) so its preset state never leaks
  // from one cita into the next.
  const [charging, setCharging] = useState<EnrichedAppointment | null>(null);

  const period = useMemo(
    () => calendarWindow(calendarView, cursor),
    [calendarView, cursor],
  );

  // CITAS-03: profesional y servicio se filtraban EN EL NAVEGADOR sobre el
  // historial completo del negocio, con los tres parámetros ya aceptados por
  // el servidor y ya serializados en `lib/api/appointments.ts`.
  const query = useMemo<ListAppointmentsParams>(
    () => ({
      status: status === "all" ? undefined : status,
      professional_id: filters.pro === "all" ? undefined : filters.pro,
      service_id: filters.svc === "all" ? undefined : filters.svc,
      // El calendario pide EL PERÍODO que dibuja; la lista pagina de verdad.
      // Antes las dos vistas bajaban el historial entero del negocio, que con el
      // `limit` de 100 del servidor llega recortado sin decirlo.
      //
      // La lista va DESCENDENTE y el orden lo pone el servidor (`ordering`), no el
      // navegador: invertir cada página en el cliente hacía que «Cargar más»
      // insertara citas más nuevas encima de las ya visibles. El calendario se
      // queda ascendente porque dibuja una rejilla por hora, donde el orden de
      // llegada de las filas es indiferente.
      ...(viewMode === "calendar"
        ? { ...period, limit: CALENDAR_LIMIT }
        : { limit: PAGE_SIZE, ordering: "-start_datetime" as const }),
    }),
    [status, filters.pro, filters.svc, viewMode, period],
  );
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  // Una respuesta que llega tarde es de la pregunta anterior: aplicarla repinta
  // la tabla con datos que no coinciden con los controles en pantalla.
  const reqSeq = useRef(0);
  const loadAppointments = useCallback(
    async (q: ListAppointmentsParams, opts: { append?: boolean } = {}) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      let next: Paginated<Appointment> | null = null;
      try {
        next = await listAppointments(q);
      } catch {
        next = null;
      }
      if (seq !== reqSeq.current) return;
      if (next === null) setError(true);
      else {
        const page = next;
        setAppointments((prev) => {
          if (!opts.append) return page.items;
          // El `offset` se corre si entra una cita mientras se pagina, así que la
          // página siguiente puede repetir una fila: dos veces la misma key.
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...page.items.filter((a) => !seen.has(a.id))];
        });
        setCount(page.count);
        setError(false);
      }
      setLoading(false);
      setLoadedOnce(true);
    },
    [],
  );

  const loadCatalogs = useCallback(async () => {
    try {
      const [svcs, pros] = await Promise.all([listServices(), listProfessionals()]);
      setServices(svcs);
      setProfessionals(pros);
    } catch {
      setError(true);
    }
  }, []);

  // Los catálogos se piden al montar (no cambian al mover un filtro, y traerlos
  // dentro del mismo `Promise.all` de las citas hacía dos requests de más por
  // cada cambio de selector) y se REFRESCAN vía SSE con servicio_*,
  // profesional_* y negocio_actualizado (este último cubre el bulk de la
  // reconciliación de plan): un servicio o profesional creado por otra sesión
  // no aparecía en «Nueva cita» hasta un reload (auditoría 2026-08-20).
  useEffect(() => {
    const t = setTimeout(() => {
      void loadCatalogs();
    }, 0);
    return () => clearTimeout(t);
  }, [loadCatalogs]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadAppointments(query);
    }, 0);
    return () => clearTimeout(t);
  }, [loadAppointments, query]);

  const retry = useCallback(() => {
    void loadAppointments(queryRef.current);
    void loadCatalogs();
  }, [loadAppointments, loadCatalogs]);

  // SSE subscription: follows the same pattern as dashboard and conversations,
  // where each screen subscribes directly to react to events without
  // reloading. NotificationsProvider handles the toasts; the page handles
  // the data refresh (existing pattern in the project).
  useEffect(() => {
    const unsub = subscribeToEvents((event: SSEEvent) => {
      switch (event.type) {
        case "nueva_cita":
        case "cita_cancelada":
        case "cita_reagendada":
          // Con los filtros vigentes, no la agenda entera: cada cita que crea
          // la IA volvía a bajar el historial completo del tenant.
          void loadAppointments(queryRef.current);
          break;
        case "servicio_creado":
        case "servicio_actualizado":
        case "servicio_eliminado":
        case "profesional_creado":
        case "profesional_actualizado":
        case "profesional_eliminado":
        // La reconciliación de plan desactiva/restaura profesionales en BULK
        // sin emitir por fila; su señal es negocio_actualizado.
        case "negocio_actualizado":
          void loadCatalogs();
          break;
      }
    });
    return unsub;
  }, [loadAppointments, loadCatalogs]);

  // DASHBOARD-04: un deep-link `?id=…` (p. ej. desde una fila del dashboard)
  // abre el historial de esa cita concreta. Lectura única al montar; el diálogo
  // busca por id, así que no depende de que las citas ya estén cargadas.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link de una sola vez al montar
    if (id) setHistoryFor(id);
  }, []);

  const handleCreate = useCallback(
    async (input: {
      service_id: string;
      customer_id: string;
      start: string;
      end: string;
      professional_id?: string;
    }) => {
      const created = await createAppointment(input);
      // Se agrega aunque no case con el filtro puesto: el operador acaba de
      // crearla y una cita que no aparece se lee como un fallo. Sale de la
      // lista sola en el próximo refetch.
      setAppointments((prev) => [...prev, created]);
      // El total sube con ella: si no, el pie podía decir «Mostrando 26 de 25».
      setCount((c) => c + 1);
    },
    [],
  );

  const handleCancel = useCallback(async (id: string, reason?: string) => {
    // Se parchea la fila con la respuesta del servidor en vez de recargar: con
    // el filtro «Agendadas» puesto, un refetch la haría desaparecer y una
    // acción exitosa se vería igual que una fallida.
    const updated = await cancelAppointment(id, reason);
    setAppointments((prev) => prev.map((a) => (a.id === id ? updated : a)));
    setCancelling(null);
  }, []);

  const handleReschedule = useCallback(
    async (id: string, next: { start: string; end: string }) => {
      const updated = await rescheduleAppointment(id, next);
      setAppointments((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setRescheduling(null);
    },
    [],
  );

  const serviceMap = new Map(services.map((s) => [s.id, s]));
  const professionalMap = new Map(professionals.map((p) => [p.id, p]));
  // Only active professionals are selectable as a filter (they're the ones who
  // can hold appointments); matches the create dialog's option list.
  const activeProfessionals = professionals.filter((p) => p.is_active);

  const enrichedAppointments = appointments.map((a) => ({
    ...a,
    customerName: a.customer_name,
    serviceName: serviceMap.get(a.service_id)?.name ?? "Servicio",
    professionalName: professionalMap.get(a.professional_id)?.name ?? "Sin asignar",
  }));

  const filtersActive =
    status !== "all" || filters.pro !== "all" || filters.svc !== "all";
  const calendarTruncated = viewMode === "calendar" && count > appointments.length;
  const clearFilters = useCallback(() => {
    // `view` no se toca: «Limpiar» borra filtros, no te devuelve al calendario
    // cuando estabas leyendo la lista.
    setFilters({ status: "all", pro: "all", svc: "all" });
  }, [setFilters]);

  const header = (
    <div>
      <h1 className="text-[1.65rem] font-bold tracking-tight text-foreground">
        Agenda
      </h1>
      <p className="mt-1.5 text-[0.8rem] text-muted-foreground">
        Tus citas y reservas.
      </p>
    </div>
  );

  if (loading && !loadedOnce) {
    return <Loading rows={5} label="Cargando agenda…" />;
  }

  // Solo cuando no hay nada que mostrar: un fallo al refrescar con datos en
  // pantalla no debe derribar la agenda que el operador está leyendo (aviso
  // abajo).
  if (error && appointments.length === 0) {
    return (
      <div className="w-full space-y-10">
        {header}
        <ErrorState
          description="Ocurrió un error al cargar la agenda."
          onRetry={retry}
        />
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header}
        <div className="flex items-center gap-3">
          <div
            role="group"
            aria-label="Vista de la agenda"
            className="flex items-center gap-1 rounded-lg bg-muted p-0.5"
          >
            <button
              type="button"
              // CITAS-08: cuál está puesta se decía solo con el fondo claro.
              aria-pressed={viewMode === "calendar"}
              onClick={() => setFilters({ view: "calendar" })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "calendar"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Calendar className="size-3.5" />
              Calendario
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "list"}
              onClick={() => setFilters({ view: "list" })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "list"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="size-3.5" />
              Lista
            </button>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Nueva cita
          </Button>
        </div>
      </div>

      <FilterBar active={filtersActive} onClear={clearFilters}>
        <div className="flex flex-col gap-1.5">
          <Label id="apt-status-label">Estado</Label>
          <StatusTabs
            value={status}
            onChange={(v) => setFilters({ status: v })}
            labelledBy="apt-status-label"
          />
        </div>
        {/* Los selectores solo aparecen cuando hay más de una opción que
            elegir: filtrar por «el único profesional» no filtra nada. */}
        {activeProfessionals.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apt-pro">Profesional</Label>
            <Select
              items={[
                { value: "all", label: "Todos los profesionales" },
                ...activeProfessionals.map((p) => ({ value: p.id, label: p.name })),
              ]}
              value={filters.pro}
              onValueChange={(v) => setFilters({ pro: v ?? "all" })}
            >
              <SelectTrigger id="apt-pro" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los profesionales</SelectItem>
                {activeProfessionals.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {services.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apt-svc">Servicio</Label>
            <Select
              items={[
                { value: "all", label: "Todos los servicios" },
                ...services.map((s) => ({ value: s.id, label: s.name })),
              ]}
              value={filters.svc}
              onValueChange={(v) => setFilters({ svc: v ?? "all" })}
            >
              <SelectTrigger id="apt-svc" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los servicios</SelectItem>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </FilterBar>

      {/* Señal textual además de la opacidad: el color solo no comunica. */}
      {loading && (
        <p role="status" className="text-xs text-muted-foreground">
          Actualizando la agenda…
        </p>
      )}
      {error && appointments.length > 0 && (
        <p role="alert" className="text-xs text-destructive">
          No se pudo actualizar la agenda. Se muestra la última versión cargada.
        </p>
      )}
      {/* El calendario no pagina —se navega por período—, así que si el período
          trae más citas de las que se pidieron hay que DECIRLO: una grilla a la
          que le faltan citas se ve exactamente igual que una completa, y eso es
          peor que un error. */}
      {calendarTruncated && (
        <p role="alert" className="text-xs text-warning">
          Este período tiene {count} citas y se muestran las primeras{" "}
          {appointments.length}. Acota los filtros o mira un rango más corto.
        </p>
      )}

      {/* Content */}
      <div aria-busy={loading || undefined} className={cn(loading && "opacity-60")}>
        {viewMode === "calendar" ? (
          // El calendario se dibuja SIEMPRE, incluso sin citas: ahora solo trae
          // las de la ventana visible, así que un mes vacío es normal y el vacío
          // de página entera se llevaba la cabecera de navegación, o sea la
          // única salida hacia el mes que sí tiene citas. Su propia rama de
          // vacío la conserva.
          <AppointmentCalendar
            appointments={enrichedAppointments}
            view={calendarView}
            onViewChange={setCalendarView}
            cursor={cursor}
            onCursorChange={setCursor}
            filtersActive={filtersActive}
            onClearFilters={clearFilters}
            onCancel={setCancelling}
            onReschedule={setRescheduling}
            onHistory={(a) => setHistoryFor(a.id)}
            onCreatePaymentLink={setCharging}
          />
        ) : appointments.length === 0 ? (
          // Dos vacíos distintos: «todavía no hay nada» pide crear la primera
          // cita; «tu filtro no encontró nada» pide limpiar el filtro. Decirle
          // «crea tu primera cita» a quien tiene 400 citas y el filtro puesto
          // era la mentira.
          filtersActive ? (
            <EmptyState
              icon={Calendar}
              title="Sin coincidencias"
              description="Ninguna cita coincide con los filtros aplicados."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Calendar}
              title="Sin citas"
              description="Aún no hay citas agendadas. Crea tu primera cita."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  Nueva cita
                </Button>
              }
            />
          )
        ) : (
          <AppointmentListView
            appointments={enrichedAppointments}
            total={count}
            loading={loading}
            onLoadMore={() =>
              void loadAppointments(
                { ...query, offset: appointments.length },
                { append: true },
              )
            }
            onCancel={setCancelling}
            onReschedule={setRescheduling}
            onHistory={(a) => setHistoryFor(a.id)}
            onCreatePaymentLink={setCharging}
          />
        )}
      </div>

      {/* Dialogs */}
      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        services={services}
        professionals={professionals}
        onCreate={handleCreate}
      />

      {cancelling && (
        <CancelDialog
          open
          onOpenChange={(open) => !open && setCancelling(null)}
          appointment={cancelling}
          onCancel={handleCancel}
        />
      )}

      {rescheduling && (
        <RescheduleDialog
          open
          onOpenChange={(open) => !open && setRescheduling(null)}
          appointment={rescheduling}
          onReschedule={handleReschedule}
        />
      )}

      <HistoryDialog
        open={historyFor !== null}
        onOpenChange={(open) => !open && setHistoryFor(null)}
        appointmentId={historyFor}
      />

      {charging && (
        <PaymentLinkDialog
          key={charging.id}
          open
          onOpenChange={(open) => !open && setCharging(null)}
          preset={{
            customer: { id: charging.customer_id, name: charging.customerName },
            appointment: charging,
          }}
        />
      )}
    </div>
  );
}

// `useSearchParams` (dentro de `useUrlFilters`) exige un boundary de Suspense
// en el App Router.
export default function AppointmentsPage() {
  return (
    <Suspense fallback={<Loading rows={5} label="Cargando agenda…" />}>
      <AppointmentsPageContent />
    </Suspense>
  );
}
