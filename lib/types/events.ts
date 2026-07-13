import type { AgentType } from "./agent";
import type { ActorType } from "./common";

/** Names of the SSE events emitted by the backend. */
export type SSEEventType =
  | "nueva_cita"
  | "cita_cancelada"
  | "cita_reagendada"
  | "mensaje_recibido"
  | "conversacion_escalada"
  | "conversacion_reactivada"
  | "mensaje_automatico_enviado"
  | "pedido_creado"
  | "pedido_borrador_creado"
  | "conversacion_cerrada"
  | "conversacion_asignada"
  | "agente_actualizado"
  | "negocio_actualizado"
  | "cliente_creado"
  | "cliente_actualizado"
  | "ficha_actualizada"
  | "nota_creada"
  | "servicio_creado"
  | "servicio_actualizado"
  | "servicio_eliminado"
  | "error_operativo"
  | "error_integracion";

/** Common wrapper for every SSE event. */
interface SSEEventBase<T extends SSEEventType, P> {
  /** Unique event id (for client-side dedupe). */
  id: string;
  type: T;
  /** ISO 8601 of emission. */
  emitted_at: string;
  data: P;
}

export type NuevaCitaEvent = SSEEventBase<
  "nueva_cita",
  {
    appointment_id: string;
    customer_id: string;
    service_id: string;
    start: string;
    /** Optional: backend added this later. Absent on older events. */
    origin?: "admin" | "ai" | "human";
  }
>;

export type CitaCanceladaEvent = SSEEventBase<
  "cita_cancelada",
  // No cancellation reason travels over this channel (PII policy: SSE
  // payloads carry ids only).
  { appointment_id: string; customer_id: string }
>;

export type CitaReagendadaEvent = SSEEventBase<
  "cita_reagendada",
  {
    appointment_id: string;
    service_id: string;
    professional_id: string;
    customer_id: string;
    start: string;
  }
>;

export type MensajeRecibidoEvent = SSEEventBase<
  "mensaje_recibido",
  { conversation_id: string; message_id: string }
>;

export type ConversacionEscaladaEvent = SSEEventBase<
  "conversacion_escalada",
  {
    conversation_id: string;
    handoff_id: string;
    triggered_by: "ai" | "customer" | "rule" | "timeout";
  }
>;

export type ConversacionReactivadaEvent = SSEEventBase<
  "conversacion_reactivada",
  // reason: "manual" (an operator reactivated) | "timeout" (inactivity sweep).
  { conversation_id: string; reason: string }
>;

export type MensajeAutomaticoEnviadoEvent = SSEEventBase<
  "mensaje_automatico_enviado",
  {
    conversation_id: string;
    scheduled_message_id: string;
    rule_code: string;
    customer_id: string;
  }
>;

export type PedidoCreadoEvent = SSEEventBase<
  "pedido_creado",
  { order_id: string; total: string; customer_id: string }
>;

/** Draft order created by the sales agent or the panel. */
export type PedidoBorradorCreadoEvent = SSEEventBase<
  "pedido_borrador_creado",
  { order_id: string; total: string; customer_id: string }
>;

/** A conversation was closed, either by an operator or the idle sweep. */
export type ConversacionCerradaEvent = SSEEventBase<
  "conversacion_cerrada",
  { conversation_id: string; reason: "manual" | "idle" }
>;

/** A conversation was taken or reassigned to a different operator. */
export type ConversacionAsignadaEvent = SSEEventBase<
  "conversacion_asignada",
  { conversation_id: string; assignee_id: string }
>;

/** An agent's config changed (PATCH /agents/{id}/). */
export type AgenteActualizadoEvent = SSEEventBase<
  "agente_actualizado",
  { agent_type: AgentType; is_active: boolean }
>;

/**
 * The business's operative status changed (PATCH /businesses/me/,
 * onboarding/complete, or an admin activate/deactivate action).
 */
export type NegocioActualizadoEvent = SSEEventBase<
  "negocio_actualizado",
  { is_operative: boolean }
>;

// --- Customer domain (data-sync: refresh lists/drawer, no toast) ---

export type ClienteCreadoEvent = SSEEventBase<
  "cliente_creado",
  { customer_id: string; origin: "operator" | "whatsapp" }
>;

export type ClienteActualizadoEvent = SSEEventBase<
  "cliente_actualizado",
  { customer_id: string; fields: string[] }
>;

export type FichaActualizadaEvent = SSEEventBase<
  "ficha_actualizada",
  {
    customer_id: string;
    record_id: string;
    changed_by: ActorType;
    fields: string[];
  }
>;

export type NotaCreadaEvent = SSEEventBase<
  "nota_creada",
  { customer_id: string; note_id: string; author: string }
>;

// --- Service catalog (data-sync) ---

export type ServicioCreadoEvent = SSEEventBase<
  "servicio_creado",
  { service_id: string; active: boolean }
>;

export type ServicioActualizadoEvent = SSEEventBase<
  "servicio_actualizado",
  { service_id: string; active: boolean }
>;

export type ServicioEliminadoEvent = SSEEventBase<
  "servicio_eliminado",
  { service_id: string }
>;

export type ErrorOperativoEvent = SSEEventBase<
  "error_operativo",
  // `event_type` names the operational event that failed; any extra keys are
  // sanitized metadata specific to that event type.
  { source: string; event_type: string; [key: string]: unknown }
>;

export type ErrorIntegracionEvent = SSEEventBase<
  "error_integracion",
  { provider: string; direction: string; error_type: string }
>;

/** Discriminated union of all SSE events. */
export type SSEEvent =
  | NuevaCitaEvent
  | CitaCanceladaEvent
  | CitaReagendadaEvent
  | MensajeRecibidoEvent
  | ConversacionEscaladaEvent
  | ConversacionReactivadaEvent
  | MensajeAutomaticoEnviadoEvent
  | PedidoCreadoEvent
  | PedidoBorradorCreadoEvent
  | ConversacionCerradaEvent
  | ConversacionAsignadaEvent
  | AgenteActualizadoEvent
  | NegocioActualizadoEvent
  | ClienteCreadoEvent
  | ClienteActualizadoEvent
  | FichaActualizadaEvent
  | NotaCreadaEvent
  | ServicioCreadoEvent
  | ServicioActualizadoEvent
  | ServicioEliminadoEvent
  | ErrorOperativoEvent
  | ErrorIntegracionEvent;
