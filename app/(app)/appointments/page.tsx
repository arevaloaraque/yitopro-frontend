"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, Plus, List } from "lucide-react";

import {
  cancelAppointment,
  createAppointment,
  listAppointments,
  listCustomers,
  listServices,
  rescheduleAppointment,
} from "@/lib/api";
import { subscribeToEvents } from "@/lib/sse";
import type {
  Appointment,
  Customer,
  Service,
  SSEEvent,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { cn } from "@/lib/utils";

import { AppointmentCalendar } from "./_components/appointment-calendar";
import { AppointmentListView } from "./_components/appointment-list-view";
import { CancelDialog } from "./_components/cancel-dialog";
import { CreateDialog } from "./_components/create-dialog";
import { HistoryDialog } from "./_components/history-dialog";
import { RescheduleDialog } from "./_components/reschedule-dialog";
import { StatusTabs, type StatusFilter } from "./_components/status-tabs";

type ViewMode = "calendar" | "list";
type PageState = "loading" | "error" | "ready" | "empty";

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [pageState, setPageState] = useState<PageState>("loading");

  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const appointmentsRef = useRef(appointments);
  const pageStateRef = useRef(pageState);
  useEffect(() => {
    appointmentsRef.current = appointments;
    pageStateRef.current = pageState;
  });

  const load = useCallback(async () => {
    const [appts, custs, svcs] = await Promise.all([
      listAppointments(),
      listCustomers(),
      listServices(),
    ]);
    return { appointments: appts, customers: custs, services: svcs };
  }, []);

  const refetch = useCallback(async () => {
    setPageState("loading");
    try {
      const data = await load();
      setAppointments(data.appointments);
      setCustomers(data.customers);
      setServices(data.services);
      setPageState(data.appointments.length === 0 ? "empty" : "ready");
    } catch {
      setPageState("error");
    }
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (cancelled) return;
        setAppointments(data.appointments);
        setCustomers(data.customers);
        setServices(data.services);
        setPageState(data.appointments.length === 0 ? "empty" : "ready");
      })
      .catch(() => {
        if (!cancelled) setPageState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // SSE subscription: sigue el mismo patrón que dashboard y conversations,
  // donde cada pantalla se suscribe directamente para reaccionar a eventos
  // sin recargar. NotificationsProvider maneja los toasts; la página maneja
  // la actualización de datos. En modo mock comparten el mismo bus; en modo
  // real cada una abre su propio EventSource (patrón existente en el proyecto).
  useEffect(() => {
    const unsub = subscribeToEvents((event: SSEEvent) => {
      switch (event.type) {
        case "nueva_cita":
        case "cita_cancelada":
        case "cita_reagendada":
          listAppointments()
            .then((appts) => {
              setAppointments(appts);
              if (appts.length === 0) setPageState("empty");
              else if (pageStateRef.current === "empty") setPageState("ready");
            })
            .catch((err) => {
              console.error("Error al refrescar citas vía SSE:", err);
            });
          break;
      }
    });
    return unsub;
  }, []);

  const handleCreate = useCallback(
    async (input: {
      service_id: string;
      customer_id: string;
      start: string;
      end: string;
    }) => {
      const created = await createAppointment(input);
      setAppointments((prev) => [...prev, created]);
      if (pageState === "empty") setPageState("ready");
    },
    [pageState],
  );

  const handleCancel = useCallback(
    async (id: string, reason?: string) => {
      const updated = await cancelAppointment(id, reason);
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? updated : a)),
      );
      setCancelling(null);
    },
    [],
  );

  const handleReschedule = useCallback(
    async (id: string, next: { start: string; end: string }) => {
      const updated = await rescheduleAppointment(id, next);
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? updated : a)),
      );
      setRescheduling(null);
    },
    [],
  );

  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  const enrichedAppointments = appointments.map((a) => ({
    ...a,
    customerName: customerMap.get(a.customer_id)?.name ?? "Desconocido",
    serviceName: serviceMap.get(a.service_id)?.name ?? "Servicio",
  }));

  if (pageState === "loading") {
    return <Loading rows={5} label="Cargando agenda…" />;
  }

  if (pageState === "error") {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <div>
          <h1 className="text-[1.65rem] font-bold tracking-tight text-foreground">Agenda</h1>
          <p className="mt-1.5 text-[0.8rem] text-muted-foreground">Tus citas y reservas.</p>
        </div>
        <ErrorState description="Ocurrió un error al cargar la agenda." onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.65rem] font-bold tracking-tight text-foreground">Agenda</h1>
          <p className="mt-1.5 text-[0.8rem] text-muted-foreground">Tus citas y reservas.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Nueva cita
        </Button>
      </div>

      {/* Toolbar: tabs + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusTabs value={statusFilter} onChange={setStatusFilter} />
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
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
            onClick={() => setViewMode("list")}
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
      </div>

      {/* Content */}
      {pageState === "empty" ? (
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
      ) : (
        <>
          {viewMode === "calendar" ? (
            <AppointmentCalendar
              appointments={enrichedAppointments}
              statusFilter={statusFilter}
              onCancel={setCancelling}
              onReschedule={setRescheduling}
              onHistory={(a) => setHistoryFor(a.id)}
            />
          ) : (
            <AppointmentListView
              appointments={enrichedAppointments}
              statusFilter={statusFilter}
              onCancel={setCancelling}
              onReschedule={setRescheduling}
              onHistory={(a) => setHistoryFor(a.id)}
            />
          )}
        </>
      )}

      {/* Dialogs */}
      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        customers={customers}
        services={services}
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
    </div>
  );
}
