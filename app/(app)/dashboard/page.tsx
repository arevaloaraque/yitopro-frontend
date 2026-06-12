"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Calendar,
  MessageSquare,
  Users,
} from "lucide-react";

import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getBusiness,
  listAgents,
  listAppointments,
  listConversations,
  listCustomers,
  listServices,
} from "@/lib/api";
import { subscribeToEvents } from "@/lib/sse";
import type {
  Agent,
  Appointment,
  Business,
  Conversation,
  Customer,
  Service,
  SSEEvent,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type PageState = "loading" | "error" | "ready";

interface AlertItem {
  id: string;
  type: "error_operativo" | "error_integracion";
  message: string;
  at: string;
}

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return {
    from: `${yyyy}-${mm}-${dd}T00:00:00.000Z`,
    to: `${yyyy}-${mm}-${dd}T23:59:59.999Z`,
  };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

function intentLabel(intent: string | null): string {
  if (!intent) return "—";
  const map: Record<string, string> = {
    agendar_cita: "Agendar cita",
    reagendar_cita: "Reagendar cita",
    consulta_precio: "Consulta precio",
    consulta_horario: "Consulta horario",
    reclamo: "Reclamo",
    comprar_producto: "Comprar producto",
  };
  return map[intent] ?? intent.replace(/_/g, " ");
}

function statusBadge(status: Conversation["status"]) {
  if (status === "ai_active") return { label: "IA activa", variant: "default" as const };
  if (status === "human_handoff")
    return { label: "Derivada", variant: "secondary" as const };
  return { label: "Cerrada", variant: "outline" as const };
}

function appointmentStatusBadge(status: Appointment["status"]) {
  switch (status) {
    case "scheduled":
      return { label: "Agendada", variant: "default" as const };
    case "cancelled":
      return { label: "Cancelada", variant: "destructive" as const };
    case "rescheduled":
      return { label: "Reagendada", variant: "secondary" as const };
    case "completed":
      return { label: "Completada", variant: "outline" as const };
  }
}

interface DashboardData {
  business: Business;
  conversations: Conversation[];
  appointments: Appointment[];
  agents: Agent[];
  customers: Customer[];
  services: Service[];
}

function MetricSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-20" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border px-4 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-4xl" />
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent>
            <ListSkeleton rows={5} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <ListSkeleton rows={3} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: "default" | "amber" | "red";
}

function MetricCard({ label, value, icon, accent = "default" }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription>{label}</CardDescription>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            accent === "amber" && "bg-amber-500/10 text-amber-600",
            accent === "red" && "bg-red-500/10 text-red-600",
            accent === "default" && "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardContent>
    </Card>
  );
}

interface ConversationRowProps {
  conversation: Conversation;
  customerName: string;
  agentName: string | null;
}

function ConversationRow({ conversation, customerName, agentName }: ConversationRowProps) {
  const s = statusBadge(conversation.status);
  return (
    <Link
      href={`/conversations`}
      className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          conversation.status === "human_handoff"
            ? "bg-amber-500/10 text-amber-600"
            : "bg-primary/10 text-primary",
        )}
      >
        <MessageSquare className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{customerName}</span>
          {conversation.unread > 0 && (
            <Badge variant="default" className="shrink-0">
              {conversation.unread}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{intentLabel(conversation.detected_intent)}</span>
          <span>·</span>
          <span>{agentName ?? "Sin agente"}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={s.variant}>{s.label}</Badge>
        <span className="text-xs text-muted-foreground">
          {relativeTime(conversation.last_message_at)}
        </span>
      </div>
    </Link>
  );
}

interface AppointmentRowProps {
  appointment: Appointment;
  customerName: string;
  serviceName: string;
}

function AppointmentRow({ appointment, customerName, serviceName }: AppointmentRowProps) {
  const s = appointmentStatusBadge(appointment.status);
  return (
    <Link
      href="/appointments"
      className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Calendar className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-medium">{customerName}</span>
        <p className="text-xs text-muted-foreground">{serviceName}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <Badge variant={s.variant}>{s.label}</Badge>
        <span className="text-xs text-muted-foreground">
          {formatTime(appointment.start)} – {formatTime(appointment.end)}
        </span>
      </div>
    </Link>
  );
}

function AlertRow({ alert }: { alert: AlertItem }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3",
        alert.type === "error_integracion"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-red-500/30 bg-red-500/5",
      )}
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 size-4 shrink-0",
          alert.type === "error_integracion" ? "text-amber-600" : "text-red-600",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {alert.type === "error_integracion" ? "Error de integración" : "Error operativo"}
        </p>
        <p className="text-xs text-muted-foreground">{alert.message}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(alert.at)}</span>
    </div>
  );
}

export default function DashboardPage() {
  const [state, setState] = useState<PageState>("loading");
  const [data, setData] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const loadData = useCallback(async () => {
    const { from, to } = todayRange();
    const [business, conversations, appointments, agents, customers, services] =
      await Promise.all([
        getBusiness(),
        listConversations(),
        listAppointments({ from, to }),
        listAgents(),
        listCustomers(),
        listServices(),
      ]);
    return { business, conversations, appointments, agents, customers, services };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadData()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event: SSEEvent) => {
      switch (event.type) {
        case "mensaje_recibido":
        case "conversacion_escalada":
          listConversations()
            .then((conversations) => {
              setData((prev) => (prev ? { ...prev, conversations } : prev));
            })
            .catch(() => {});
          break;
        case "nueva_cita":
        case "cita_cancelada":
        case "cita_reagendada": {
          const { from, to } = todayRange();
          listAppointments({ from, to })
            .then((appointments) => {
              setData((prev) => (prev ? { ...prev, appointments } : prev));
            })
            .catch(() => {});
          break;
        }
        case "error_operativo":
          setAlerts((prev) =>
            [
              {
                id: event.id,
                type: event.type,
                message: event.data.message,
                at: event.emitted_at,
              },
              ...prev,
            ].slice(0, 10),
          );
          break;
        case "error_integracion":
          setAlerts((prev) =>
            [
              {
                id: event.id,
                type: event.type,
                message: `${event.data.integration}: ${event.data.message}`,
                at: event.emitted_at,
              },
              ...prev,
            ].slice(0, 10),
          );
          break;
      }
    });
    return unsubscribe;
  }, []);

  if (state === "loading") return <DashboardSkeleton />;

  if (state === "error" || !data) {
    return (
      <ErrorState
        title="No se pudo cargar el dashboard"
        description="Ocurrió un error al obtener los datos. Revisa tu conexión e inténtalo de nuevo."
        onRetry={() => {
          setState("loading");
          loadData()
            .then((result) => {
              setData(result);
              setState("ready");
            })
            .catch(() => setState("error"));
        }}
      />
    );
  }

  const { business, conversations, appointments, agents, customers, services } = data;

  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  const activeConversations = conversations.filter((c) => c.status !== "closed");
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);
  const assistantActive = agents.some((a) => a.is_active) && business.assistant_config.autonomous;

  const recentConversations = conversations.slice(0, 5);
  const todayAppointments = appointments.filter(
    (a) => a.status !== "cancelled",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Resumen de la actividad de {business.name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Conversaciones activas"
          value={activeConversations.length}
          icon={<MessageSquare className="size-4" />}
        />
        <MetricCard
          label="Citas de hoy"
          value={todayAppointments.length}
          icon={<Calendar className="size-4" />}
        />
        <MetricCard
          label="Mensajes sin leer"
          value={totalUnread}
          icon={<Users className="size-4" />}
          accent={totalUnread > 0 ? "amber" : "default"}
        />
        <MetricCard
          label="Asistente"
          value={assistantActive ? "Activo" : "Pausado"}
          icon={<Bot className="size-4" />}
          accent={assistantActive ? "default" : "amber"}
        />
      </div>

      {alerts.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 text-amber-600" />
              Alertas operativas
            </CardTitle>
            <CardDescription>
              {alerts.length} alerta{alerts.length !== 1 ? "s" : ""} reciente
              {alerts.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm">Conversaciones recientes</CardTitle>
              <CardDescription>
                Últimas {recentConversations.length} conversaciones activas
              </CardDescription>
            </div>
            <Link
              href="/conversations"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Ver todas
              <ArrowUpRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentConversations.length === 0 ? (
              <EmptyState
                title="Sin conversaciones"
                description="No hay conversaciones recientes para mostrar."
                icon={MessageSquare}
              />
            ) : (
              <div className="space-y-2">
                {recentConversations.map((c) => {
                  const customer = customerMap.get(c.customer_id);
                  const agent = c.active_agent ? agentMap.get(c.active_agent) : null;
                  return (
                    <ConversationRow
                      key={c.id}
                      conversation={c}
                      customerName={customer?.name ?? "Desconocido"}
                      agentName={agent?.name ?? null}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm">Citas de hoy</CardTitle>
              <CardDescription>
                {todayAppointments.length} cita{todayAppointments.length !== 1 ? "s" : ""}{" "}
                programada{todayAppointments.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <Link
              href="/appointments"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Ver agenda
              <ArrowUpRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {todayAppointments.length === 0 ? (
              <EmptyState
                title="Sin citas hoy"
                description="No hay citas programadas para el día de hoy."
                icon={Calendar}
              />
            ) : (
              <div className="space-y-2">
                {todayAppointments.map((a) => {
                  const customer = customerMap.get(a.customer_id);
                  const service = serviceMap.get(a.service_id);
                  return (
                    <AppointmentRow
                      key={a.id}
                      appointment={a}
                      customerName={customer?.name ?? "Desconocido"}
                      serviceName={service?.name ?? "Servicio"}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
