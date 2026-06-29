import type { ActorType } from "./common";

/** Names of the SSE events emitted by the backend. */
export type SSEEventType =
  | "nueva_cita"
  | "cita_cancelada"
  | "cita_reagendada"
  | "mensaje_recibido"
  | "conversacion_escalada"
  | "pedido_creado"
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
    created_by: ActorType;
  }
>;

export type CitaCanceladaEvent = SSEEventBase<
  "cita_cancelada",
  { appointment_id: string; customer_id: string; reason: string | null }
>;

export type CitaReagendadaEvent = SSEEventBase<
  "cita_reagendada",
  {
    appointment_id: string;
    customer_id: string;
    old_start: string;
    new_start: string;
  }
>;

export type MensajeRecibidoEvent = SSEEventBase<
  "mensaje_recibido",
  {
    conversation_id: string;
    message_id: string;
    customer_id: string;
    preview: string;
  }
>;

export type ConversacionEscaladaEvent = SSEEventBase<
  "conversacion_escalada",
  { conversation_id: string; customer_id: string; reason: string }
>;

export type PedidoCreadoEvent = SSEEventBase<
  "pedido_creado",
  {
    conversation_id: string;
    customer_id: string;
    product_id: string;
    quantity: number;
    total: number;
  }
>;

export type ErrorOperativoEvent = SSEEventBase<
  "error_operativo",
  { code: string; message: string }
>;

export type ErrorIntegracionEvent = SSEEventBase<
  "error_integracion",
  { integration: string; message: string }
>;

/** Discriminated union of all SSE events. */
export type SSEEvent =
  | NuevaCitaEvent
  | CitaCanceladaEvent
  | CitaReagendadaEvent
  | MensajeRecibidoEvent
  | ConversacionEscaladaEvent
  | PedidoCreadoEvent
  | ErrorOperativoEvent
  | ErrorIntegracionEvent;
