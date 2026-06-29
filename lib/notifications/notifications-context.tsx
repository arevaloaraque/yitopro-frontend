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
import type { SSEEvent, SSEEventType } from "@/lib/types";

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
  clear: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** How many notifications we keep in memory. */
const MAX_NOTIFICATIONS = 30;

/** Translates an SSE event into its notification presentation. */
function toNotification(event: SSEEvent): AppNotification {
  const base = { id: event.id, type: event.type, at: event.emitted_at, read: false };

  switch (event.type) {
    case "mensaje_recibido":
      return {
        ...base,
        title: "Nuevo mensaje",
        description: event.data.preview,
        tone: "default",
      };
    case "nueva_cita":
      return {
        ...base,
        title: "Nueva cita agendada",
        description: `Creada por ${event.data.created_by === "ai" ? "la IA" : "un operador"}`,
        tone: "default",
      };
    case "cita_cancelada":
      return {
        ...base,
        title: "Cita cancelada",
        description: event.data.reason ?? "Sin motivo indicado",
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
        description: event.data.reason,
        tone: "accent",
      };
    case "pedido_creado":
      return {
        ...base,
        title: "Nuevo pedido",
        description: `${event.data.quantity} unidad(es) · total ${event.data.total}`,
        tone: "default",
      };
    case "error_operativo":
      return {
        ...base,
        title: "Error operativo",
        description: event.data.message,
        tone: "error",
      };
    case "error_integracion":
      return {
        ...base,
        title: "Error de integración",
        description: `${event.data.integration}: ${event.data.message}`,
        tone: "error",
      };
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
      if (notification.type === "nueva_cita" || notification.type === "pedido_creado") {
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

  const clear = useCallback(() => {
    setNotifications([]);
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
      markAllRead,
      clear,
    }),
    [notifications, markAllRead, clear],
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
