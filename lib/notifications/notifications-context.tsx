"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { subscribeToEvents } from "@/lib/sse";
import type { ConversacionEscaladaEvent, SSEEvent, SSEEventType } from "@/lib/types";

/** Visual severity of a notification. */
export type NotificationTone = "default" | "accent" | "error";

/** Notification derived from an SSE event, ready to show in the UI. */
export interface AppNotification {
  id: string;
  type: SSEEventType;
  title: string;
  description: string;
  tone: NotificationTone;
  /** ISO 8601. */
  at: string;
  read: boolean;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** How many notifications we keep in memory. */
const MAX_NOTIFICATIONS = 30;

/** Human-readable label for each `conversacion_escalada` trigger. */
const ESCALATION_REASON_LABELS: Record<
  ConversacionEscaladaEvent["data"]["triggered_by"],
  string
> = {
  ai: "La IA solicitó ayuda",
  customer: "El cliente pidió un humano",
  rule: "Regla de escalamiento",
  timeout: "Por inactividad",
};

/**
 * Translates an SSE event into its notification presentation, or `null` for
 * data-sync events that must NOT surface as a toast/bell entry (customer &
 * service domain changes — screens refresh their own data; toasting them would
 * be noise since they're mostly the operator's own echo).
 */
function toNotification(event: SSEEvent): AppNotification | null {
  const base = { id: event.id, type: event.type, at: event.emitted_at, read: false };

  switch (event.type) {
    case "mensaje_recibido":
      return {
        ...base,
        title: "Nuevo mensaje",
        // No message body/preview travels over this channel (PII policy).
        description: "Un cliente envió un mensaje por WhatsApp",
        tone: "default",
      };
    case "nueva_cita":
      if (!event.data.origin) {
        // Older events (emitted before the backend added `origin`).
        return {
          ...base,
          title: "Nueva cita",
          description: "Se agendó una nueva cita",
          tone: "default",
        };
      }
      return {
        ...base,
        title: "Nueva cita agendada",
        description: `Creada por ${event.data.origin === "ai" ? "la IA" : "un operador"}`,
        tone: "default",
      };
    case "cita_cancelada":
      return {
        ...base,
        title: "Cita cancelada",
        // No cancellation reason travels over SSE (PII policy).
        description: "Se canceló una cita",
        tone: "accent",
      };
    case "cita_reagendada":
      return {
        ...base,
        title: "Cita reagendada",
        description: "Se actualizó el horario de una cita",
        tone: "accent",
      };
    case "conversacion_escalada":
      return {
        ...base,
        title: "Conversación escalada",
        description: ESCALATION_REASON_LABELS[event.data.triggered_by],
        tone: "accent",
      };
    case "conversacion_reactivada":
      return {
        ...base,
        title: "Conversación reactivada",
        description:
          event.data.reason === "timeout"
            ? "La IA retomó la conversación por inactividad"
            : "La IA retomó la conversación",
        tone: "default",
      };
    case "mensaje_automatico_enviado":
      return {
        ...base,
        title: "Mensaje automático enviado",
        description: "Se envió un mensaje programado al cliente",
        tone: "default",
      };
    case "pedido_creado":
      return {
        ...base,
        title: "Nuevo pedido",
        description: `Total ${event.data.total}`,
        tone: "default",
      };
    case "pedido_borrador_creado":
      return {
        ...base,
        title: "Nuevo pedido por confirmar",
        description: `Total ${event.data.total}`,
        tone: "default",
      };
    case "error_operativo":
      return {
        ...base,
        title: "Error operativo",
        description: `${event.data.source}: ${event.data.event_type}`,
        tone: "error",
      };
    case "error_integracion":
      return {
        ...base,
        title: "Error de integración",
        description: `${event.data.provider}: ${event.data.error_type}`,
        tone: "error",
      };
    // Data-sync events — silent. The customers/services/conversations/dashboard
    // screens refresh their own data on these; they are not user-facing alerts.
    case "cliente_creado":
    case "cliente_actualizado":
    case "ficha_actualizada":
    case "nota_creada":
    case "servicio_creado":
    case "servicio_actualizado":
    case "servicio_eliminado":
    case "conversacion_cerrada":
    case "conversacion_asignada":
    case "agente_actualizado":
    case "negocio_actualizado":
      return null;
  }
}

/** Fires a non-intrusive toast according to the notification's severity. */
function notify(notification: AppNotification): void {
  const options = { description: notification.description };
  switch (notification.tone) {
    case "error":
      toast.error(notification.title, options);
      break;
    case "accent":
      toast.warning(notification.title, options);
      break;
    default:
      if (
        notification.type === "nueva_cita" ||
        notification.type === "pedido_creado" ||
        notification.type === "pedido_borrador_creado"
      ) {
        toast.success(notification.title, options);
      } else {
        toast(notification.title, options);
      }
  }
}

/**
 * Provides the notifications store and opens the SSE subscription ONLY once.
 * Must be mounted at the authenticated layout level, not per screen.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Avoids duplicate toasts if an event arrives twice (dedupe by id).
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (seenIds.current.has(event.id)) return;
      seenIds.current.add(event.id);

      const notification = toNotification(event);
      if (!notification) return; // data-sync event — no toast / bell entry
      notify(notification);
      setNotifications((prev) => [notification, ...prev].slice(0, MAX_NOTIFICATIONS));
    });
    return unsubscribe;
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev,
    );
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
      markAllRead,
    }),
    [notifications, markAllRead],
  );

  return <NotificationsContext value={value}>{children}</NotificationsContext>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications debe usarse dentro de <NotificationsProvider>.");
  }
  return ctx;
}
