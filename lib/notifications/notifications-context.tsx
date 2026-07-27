"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { subscribeToEvents } from "@/lib/sse";
import type { ConversacionEscaladaEvent, SSEEvent, SSEEventType } from "@/lib/types";

import {
  isSoundMuted,
  playNotificationSound,
  setSoundMuted,
  subscribeSoundMuted,
  unlockSound,
  type SoundKind,
} from "./sound";

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
  /** Where the operator should land when they act on it. `undefined` when the
   * event has no screen worth opening. */
  href?: string;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  soundMuted: boolean;
  toggleSound: () => void;
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
/**
 * Screen to open when the operator acts on a notification.
 *
 * Derived centrally from the payload ids instead of at each of the 12 return
 * sites below: every event that is worth surfacing already carries the id of the
 * thing it happened to. Without this the bell was a dead end — "Nuevo mensaje"
 * with no way to reach the message (live QA 2026-07-26).
 */
function hrefFor(event: SSEEvent): string | undefined {
  const data = event.data as Record<string, unknown>;
  if (typeof data.conversation_id === "string") {
    return `/conversations?id=${data.conversation_id}`;
  }
  if (typeof data.appointment_id === "string") {
    return `/appointments?id=${data.appointment_id}`;
  }
  // The orders screen has no per-order deep link; the panel opens on the list.
  if (typeof data.order_id === "string") return "/orders";
  return undefined;
}

/** Which ping an event deserves, or `null` for silence. */
function soundFor(notification: AppNotification): SoundKind | null {
  switch (notification.type) {
    // Someone is waiting on a human: the loudest thing we have.
    case "conversacion_escalada":
    case "error_operativo":
    case "error_integracion":
      return "alert";
    case "mensaje_recibido":
      return "message";
    case "nueva_cita":
    case "pedido_creado":
    case "pedido_borrador_creado":
      return "success";
    // Everything else is an echo of something already in motion (cancellations,
    // reactivations, automatic sends): visible in the bell, but not audible.
    default:
      return null;
  }
}

function toNotification(event: SSEEvent): AppNotification | null {
  const base = {
    id: event.id,
    type: event.type,
    at: event.emitted_at,
    read: false,
    href: hrefFor(event),
  };

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
    case "pedido_borrador_actualizado":
      return {
        ...base,
        title: "Pedido actualizado",
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

/** Fires a non-intrusive toast (and its ping) according to the severity. */
function notify(notification: AppNotification): void {
  const kind = soundFor(notification);
  if (kind) playNotificationSound(kind);
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
/** A duplicate delivery is the same event about the same thing within a moment.
 * The previous dedupe keyed on `event.id`, which `lib/sse` mints locally and
 * monotonically (`evt_<time>_<seq>`) — so the Set could never hit, the guard was
 * dead code, and it grew unbounded. Content + a short window is the only thing
 * we can key on until the backend sends a stable id. */
const DEDUPE_WINDOW_MS = 3000;

function dedupeKey(event: SSEEvent): string {
  const data = event.data as Record<string, unknown>;
  const subject =
    data.conversation_id ?? data.appointment_id ?? data.order_id ?? data.customer_id ?? "";
  return `${event.type}:${String(subject)}`;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // The mute preference lives in localStorage, i.e. outside React. Reading it with
  // useSyncExternalStore keeps SSR and the first client render in agreement (server
  // snapshot = audible) without mirroring it in state.
  const soundMuted = useSyncExternalStore(subscribeSoundMuted, isSoundMuted, () => false);

  const lastSeen = useRef<Map<string, number>>(new Map());

  // The autoplay policy keeps an AudioContext suspended until a real gesture, and
  // a suspended context drops beeps silently — so the FIRST notification of the
  // session would be mute without this. Any click in the shell unlocks it, once.
  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      const key = dedupeKey(event);
      const now = Date.now();
      const previous = lastSeen.current.get(key);
      if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return;
      lastSeen.current.set(key, now);
      // Keep the map bounded: drop anything older than the window.
      for (const [k, t] of lastSeen.current) {
        if (now - t >= DEDUPE_WINDOW_MS) lastSeen.current.delete(k);
      }

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

  const toggleSound = useCallback(() => {
    setSoundMuted(!isSoundMuted());
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
      markAllRead,
      soundMuted,
      toggleSound,
    }),
    [notifications, markAllRead, soundMuted, toggleSound],
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
