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
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CreditCard,
  MessageSquare,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";

import { NotificationToast } from "./notification-toast";
import {
  areToastsEnabled,
  setToastsEnabled,
  subscribeNotificationPreferences,
} from "./preferences";

import { getRecentNotifications } from "@/lib/api/notifications";
import { subscribeToEvents } from "@/lib/sse";
import type { ConversacionEscaladaEvent, SSEEvent, SSEEventType } from "@/lib/types";

import {
  isSoundMuted,
  playNotificationSound,
  setSoundMuted,
  subscribeSoundSettings,
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
  /** Si los avisos aparecen como tarjeta emergente. La campana se alimenta igual. */
  toastsEnabled: boolean;
  toggleToasts: () => void;
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
    // Se queda en `?id=`, y no por compatibilidad: el payload del SSE no trae
    // `customer_id` (política de PII: solo ids), así que este llamador no se puede
    // enriquecer desde el cliente. La pantalla lo resuelve y reescribe la URL.
    return `/conversations?id=${data.conversation_id}`;
  }
  // Neither the appointments nor the orders screen reads an id from the query string
  // (only /conversations does), so a deep link would land on the plain list with a junk
  // parameter — the honest link is the list itself. Wire the param on those screens and
  // this becomes a one-line change.
  if (typeof data.appointment_id === "string") return "/appointments";
  if (typeof data.order_id === "string") return "/orders";
  if (typeof data.payment_id === "string") return "/payments";
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
    // The calendar changed. All three share one voice on purpose: what the operator
    // needs to hear without looking is "your agenda moved", and the bell says which way.
    // Reschedules and cancellations used to be silent, so a customer cancelling from
    // WhatsApp — which no operator caused — made no sound at all.
    case "nueva_cita":
    case "cita_reagendada":
    case "cita_cancelada":
      return "appointment";
    // Orders carry their own configurable timbre: telling "a customer wrote" apart from
    // "an order came in" WITHOUT looking at the screen is the point of the setting in
    // Ajustes → Notificaciones, and the three slots are guaranteed to differ.
    case "pedido_borrador_creado":
      return "order";
    // Everything else is an echo of something already in motion (reactivations,
    // automatic sends, draft edits): visible in the bell, but not audible.
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
    case "pedido_borrador_creado":
      return {
        ...base,
        title: "Nuevo pedido por confirmar",
        description: `Total ${event.data.total}`,
        tone: "default",
      };
    // Un pago confirmado alimenta campana y toast pero NO suena: los tres timbres
    // configurables cubren mensajes/pedidos/agenda y el pago no tiene slot propio
    // (soundFor cae al default silencioso). La pantalla de pagos se refresca sola
    // con este mismo evento, así que el aviso visual basta.
    case "pago_recibido":
      return {
        ...base,
        title: "Pago recibido",
        description: `${event.data.amount} ${event.data.currency}`,
        tone: "default",
      };
    // Rechazado va en tono de aviso, no de error: no falló la plataforma, falló el cobro, y
    // es algo sobre lo que el operador puede hacer algo (reintentar, contactar al cliente).
    case "pago_rechazado":
      return {
        ...base,
        title: "Pago rechazado",
        description: `${event.data.amount} ${event.data.currency}`,
        tone: "accent",
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
    case "producto_creado":
    case "producto_actualizado":
    case "profesional_creado":
    case "profesional_actualizado":
    case "profesional_eliminado":
    case "conversacion_cerrada":
    case "conversacion_asignada":
    case "agente_actualizado":
    case "negocio_actualizado":
    // Confirming and cancelling are OPERATOR actions, not incoming work: whoever did it
    // already got a toast naming the order, the amount and the stock effect, and a second
    // panel just refreshes its list. `pedido_creado` used to announce "Nuevo pedido" here
    // even though the backend emits it on CONFIRM (see RealtimeEvent.PEDIDO_CREADO), so a
    // confirmation produced two toasts at once — "Pedido #31 confirmado · $17.000" next to
    // "Nuevo pedido", the second one also being factually wrong. `pedido_borrador_creado`
    // stays loud: that one IS new work arriving from WhatsApp.
    // Un enlace acuñado tampoco alerta: casi siempre es eco del propio diálogo o
    // trabajo de la IA en curso; la tabla de pagos se refresca sola con él.
    case "enlace_pago_creado":
    case "pedido_creado":
    case "pedido_cancelado":
      return null;
  }
}

/**
 * The circular badge on the left of a toast: WHAT KIND of notification this is, readable
 * before the text. Keyed by domain, not by severity — severity is already carried by the
 * tone and the wording, while "is this an order or an appointment?" had no visual at all.
 *
 * A type with no entry falls back to the bell rather than rendering nothing, so a new event
 * added later degrades to "a notification" instead of an empty circle.
 */
const DOMAIN_BADGE: Partial<
  Record<SSEEventType, { Icon: typeof Bell; className: string; label: string }>
> = {
  pedido_borrador_creado: {
    Icon: Receipt,
    className: "bg-primary/12 text-primary",
    label: "Pedido",
  },
  pedido_borrador_actualizado: {
    Icon: Receipt,
    className: "bg-primary/12 text-primary",
    label: "Pedido",
  },
  pago_recibido: {
    Icon: CreditCard,
    className: "bg-success/15 text-success",
    label: "Pago",
  },
  pago_rechazado: {
    Icon: CreditCard,
    className: "bg-warning/20 text-warning-foreground",
    label: "Pago rechazado",
  },
  nueva_cita: { Icon: CalendarDays, className: "bg-info/15 text-info", label: "Cita" },
  cita_cancelada: {
    Icon: CalendarDays,
    className: "bg-info/15 text-info",
    label: "Cita",
  },
  cita_reagendada: {
    Icon: CalendarDays,
    className: "bg-info/15 text-info",
    label: "Cita",
  },
  mensaje_recibido: {
    Icon: MessageSquare,
    className: "bg-success/15 text-success",
    label: "Mensaje",
  },
  mensaje_automatico_enviado: {
    Icon: MessageSquare,
    className: "bg-success/15 text-success",
    label: "Mensaje",
  },
  conversacion_escalada: {
    Icon: MessageSquare,
    className: "bg-warning/20 text-warning-foreground",
    label: "Conversación",
  },
  conversacion_reactivada: {
    Icon: MessageSquare,
    className: "bg-success/15 text-success",
    label: "Conversación",
  },
  error_operativo: {
    Icon: AlertTriangle,
    className: "bg-destructive/15 text-destructive",
    label: "Error",
  },
  error_integracion: {
    Icon: AlertTriangle,
    className: "bg-destructive/15 text-destructive",
    label: "Error",
  },
};

function domainBadge(type: SSEEventType) {
  const meta = DOMAIN_BADGE[type] ?? {
    Icon: Bell,
    className: "bg-muted text-muted-foreground",
    label: "Aviso",
  };
  const { Icon, className, label } = meta;
  // Tamaño fijo, en utilidades y no en CSS global: la tarjeta es markup nuestro
  // (`toast.custom`), así que ya no hay que vencer la regla de 16x16 que sonner impone a su
  // propio slot de icono.
  return (
    <span
      className={`grid size-14 shrink-0 place-items-center rounded-full ${className}`}
      role="img"
      aria-label={label}
    >
      <Icon className="size-7" aria-hidden />
    </span>
  );
}

/**
 * Fires a non-intrusive toast (and its ping) according to the severity.
 *
 * `toast.custom` en vez de `toast.success/error/…`: la tarjeta entera es el enlace al
 * destino, así que el markup tiene que ser nuestro. Eso reemplaza al botón «Ver», que no
 * había forma de alinear parejo entre cajas de distinto alto.
 */
function notify(notification: AppNotification): void {
  const kind = soundFor(notification);
  if (kind) playNotificationSound(kind);
  const id = toast.custom((toastId) => (
    <NotificationToast
      title={notification.title}
      description={notification.description}
      href={notification.href}
      badge={domainBadge(notification.type)}
      tone={notification.tone === "error" ? "error" : "default"}
      onClose={() => toast.dismiss(toastId)}
    />
  ));
  capActiveToasts(id);
}

/** Cuántos avisos conviven en pantalla. */
const MAX_TOASTS = 4;
const activeToastIds: (string | number)[] = [];

/**
 * Mantiene el tope descartando el aviso más viejo, en vez de dejar que sonner lo esconda.
 *
 * Con `visibleToasts` sonner **deja montados** los que exceden el tope, en `data-visible=
 * "false"` y opacidad 0, esperando un hueco: medido, 7 elementos en el DOM con 4 en pantalla.
 * Descartarlos de verdad los saca del árbol, y para un aviso es lo correcto —el que se pierde
 * sigue estando en la campana, así que no se pierde nada—. Los que se auto-cierran ya los
 * removía sonner solo (verificado: 0 elementos y hasta el contenedor desaparece).
 */
function capActiveToasts(id: string | number): void {
  activeToastIds.push(id);
  while (activeToastIds.length > MAX_TOASTS) {
    const oldest = activeToastIds.shift();
    if (oldest !== undefined) toast.dismiss(oldest);
  }
}

/**
 * Provides the notifications store and opens the SSE subscription ONLY once.
 * Must be mounted at the authenticated layout level, not per screen.
 */
/** A duplicate delivery is the same event with the same payload within a moment.
 * The original dedupe keyed on `event.id`, which `lib/sse` mints locally and
 * monotonically (`evt_<time>_<seq>`) — so the Set could never hit, the guard was
 * dead code, and it grew unbounded. Content + a short window is the only thing
 * we can key on until the backend sends a stable id. */
const DEDUPE_WINDOW_MS = 3000;

/** The WHOLE payload, not a hand-picked subject.
 *
 * Keying on `conversation_id` alone dropped the field that actually distinguishes the
 * events: the backend publishes one `mensaje_recibido` per inbound message, each with
 * its own `message_id`, so a three-message WhatsApp burst collapsed into ONE bell entry
 * and one ping — while the dashboard counter, which subscribes separately and does not
 * dedupe, counted three. And the two error events carry none of those ids at all, so
 * every `error_operativo` keyed identically and two distinct failures 3 s apart lost
 * one — the `alert`-voice events one least wants swallowed (review 2026-07-27).
 *
 * A genuine redelivery repeats the payload byte for byte; two distinct messages never
 * do. Key order is stable because both sides come from the same JSON parse. */
function dedupeKey(event: SSEEvent): string {
  return `${event.type}:${JSON.stringify(event.data ?? null)}`;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // The mute preference lives in localStorage, i.e. outside React. Reading it with
  // useSyncExternalStore keeps SSR and the first client render in agreement (server
  // snapshot = audible) without mirroring it in state.
  const soundMuted = useSyncExternalStore(
    subscribeSoundSettings,
    isSoundMuted,
    () => false,
  );
  const toastsEnabled = useSyncExternalStore(
    subscribeNotificationPreferences,
    areToastsEnabled,
    () => true,
  );

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
      // La campana se alimenta SIEMPRE. Apagar los avisos emergentes silencia la interrupción,
      // no la información: quien los apaga no quiere perderse nada, quiere elegir cuándo
      // mirarlo. Se lee del store en cada evento (no de una prop) para que apagarlos surta
      // efecto al instante sin re-suscribir el stream.
      if (areToastsEnabled()) notify(notification);
      setNotifications((prev) => [notification, ...prev].slice(0, MAX_NOTIFICATIONS));
    });
    return unsubscribe;
  }, []);

  // Siembra de la campana desde el backend: sin esto, un F5 no desactualizaba la
  // campana — la DESTRUÍA (auditoría 2026-08-20). Reglas de la siembra: nunca pasa
  // por notify() (cero toasts/sonidos re-disparados), entra LEÍDA (read: true —
  // re-alarmar en cada recarga con lo ya visto sería ruido perpetuo), se dedupea
  // contra lo que ya llegó vivo en la ventana montaje→respuesta, y los eventos
  // silenciosos quedan fuera por la misma regla del stream (toNotification → null).
  // Si el endpoint todavía no existe (404/red), el catch deja el comportamiento
  // de siempre: el frontend se despliega antes que el backend.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    getRecentNotifications()
      .then((events) => {
        const seeded = events
          .filter((e) => !lastSeen.current.has(dedupeKey(e)))
          .map(toNotification)
          .filter((n): n is AppNotification => n !== null)
          .map((n) => ({ ...n, read: true }));
        if (seeded.length === 0) return;
        setNotifications((prev) =>
          [...prev, ...seeded]
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, MAX_NOTIFICATIONS),
        );
      })
      .catch(() => {
        // Degradación silenciosa: campana solo en memoria, como hasta hoy.
      });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev,
    );
  }, []);

  const toggleSound = useCallback(() => {
    setSoundMuted(!isSoundMuted());
  }, []);

  const toggleToasts = useCallback(() => {
    setToastsEnabled(!areToastsEnabled());
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
      markAllRead,
      soundMuted,
      toggleSound,
      toastsEnabled,
      toggleToasts,
    }),
    [notifications, markAllRead, soundMuted, toggleSound, toastsEnabled, toggleToasts],
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
