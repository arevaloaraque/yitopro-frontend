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
  | "pedido_cancelado"
  | "pago_recibido"
  | "pago_rechazado"
  | "pedido_borrador_creado"
  | "pedido_borrador_actualizado"
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
  | "producto_creado"
  | "producto_actualizado"
  | "profesional_creado"
  | "profesional_actualizado"
  | "profesional_eliminado"
  | "enlace_pago_creado"
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

// Only the event types a consumer actually switches on by name are exported;
// the rest exist to type the `SSEEvent` union below and stay module-private.

type NuevaCitaEvent = SSEEventBase<
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

type CitaCanceladaEvent = SSEEventBase<
  "cita_cancelada",
  // No cancellation reason travels over this channel (PII policy: SSE
  // payloads carry ids only).
  { appointment_id: string; customer_id: string }
>;

type CitaReagendadaEvent = SSEEventBase<
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

type PedidoCreadoEvent = SSEEventBase<
  "pedido_creado",
  { order_id: string; total: string; customer_id: string }
>;

/** Draft order created by the sales agent or the panel. */
type PedidoBorradorCreadoEvent = SSEEventBase<
  "pedido_borrador_creado",
  { order_id: string; total: string; customer_id: string }
>;

/** A draft order's line items were modified (sales agent or panel). */
type PedidoBorradorActualizadoEvent = SSEEventBase<
  "pedido_borrador_actualizado",
  { order_id: string; total: string; customer_id: string }
>;

/** An order was cancelled (a draft dropped, or a confirmed one reversed + stock restored). */
type PedidoCanceladoEvent = SSEEventBase<
  "pedido_cancelado",
  { order_id: string; total: string; customer_id: string }
>;

/** A conversation was closed, either by an operator or the idle sweep. */
export type ConversacionCerradaEvent = SSEEventBase<
  "conversacion_cerrada",
  { conversation_id: string; reason: "manual" | "idle" }
>;

/** A payment was confirmed by the gateway. Ids and amounts only — no shopper. */
type PagoRecibidoEvent = SSEEventBase<
  "pago_recibido",
  { payment_id: string; amount: string; currency: string; customer_id: string | null }
>;

/** The gateway gave a FINAL no. The mirror of `pago_recibido`, and the reason it
 *  exists: a refused charge used to keep rendering "Pendiente" on every open
 *  panel — including operators who never triggered the check — until a reload. */
type PagoRechazadoEvent = SSEEventBase<
  "pago_rechazado",
  { payment_id: string; amount: string; currency: string; customer_id: string | null }
>;

/** A conversation was taken or reassigned to a different operator. */
export type ConversacionAsignadaEvent = SSEEventBase<
  "conversacion_asignada",
  { conversation_id: string; assignee_id: string }
>;

/** An agent's config changed (PATCH /agents/{id}/). */
type AgenteActualizadoEvent = SSEEventBase<
  "agente_actualizado",
  { agent_type: AgentType; is_active: boolean }
>;

/**
 * The business's operative status changed (PATCH /businesses/me/,
 * onboarding/complete, or an admin activate/deactivate action).
 */
type NegocioActualizadoEvent = SSEEventBase<
  "negocio_actualizado",
  { is_operative: boolean }
>;

// --- Customer domain (data-sync: refresh lists/drawer, no toast) ---

type ClienteCreadoEvent = SSEEventBase<
  "cliente_creado",
  { customer_id: string; origin: "operator" | "whatsapp" }
>;

type ClienteActualizadoEvent = SSEEventBase<
  "cliente_actualizado",
  { customer_id: string; fields: string[] }
>;

type FichaActualizadaEvent = SSEEventBase<
  "ficha_actualizada",
  {
    customer_id: string;
    record_id: string;
    changed_by: ActorType;
    fields: string[];
  }
>;

type NotaCreadaEvent = SSEEventBase<
  "nota_creada",
  { customer_id: string; note_id: string; author: string }
>;

// --- Service catalog (data-sync) ---

type ServicioCreadoEvent = SSEEventBase<
  "servicio_creado",
  { service_id: string; active: boolean }
>;

type ServicioActualizadoEvent = SSEEventBase<
  "servicio_actualizado",
  { service_id: string; active: boolean }
>;

type ServicioEliminadoEvent = SSEEventBase<
  "servicio_eliminado",
  { service_id: string }
>;

// --- Product catalog (data-sync) ---
// Espejo de servicio_*, emitidos post-commit desde POST/PATCH /api/products/.
// NO existe `producto_eliminado`: el API de tenant no tiene DELETE de productos
// (desactivar es el único camino), y un nombre que nada emite es mentira en el
// contrato — se retiró de aquí cuando el backend lo confirmó (2026-08-20).

type ProductoCreadoEvent = SSEEventBase<
  "producto_creado",
  { product_id: string; active?: boolean }
>;

type ProductoActualizadoEvent = SSEEventBase<
  "producto_actualizado",
  { product_id: string; active?: boolean }
>;

// --- Professionals (data-sync) ---
// A diferencia de productos, `profesional_eliminado` SÍ existe: el DELETE de
// profesionales es real (físico, con 409 si tiene citas). OJO: la
// reconciliación de plan desactiva/restaura profesionales en BULK y no emite
// por fila — esa señal viaja como `negocio_actualizado`, por eso los
// consumidores escuchan ambos.

type ProfesionalCreadoEvent = SSEEventBase<
  "profesional_creado",
  { professional_id: string; active?: boolean }
>;

type ProfesionalActualizadoEvent = SSEEventBase<
  "profesional_actualizado",
  { professional_id: string; active?: boolean }
>;

type ProfesionalEliminadoEvent = SSEEventBase<
  "profesional_eliminado",
  { professional_id: string }
>;

/** Un enlace de pago fue acuñado (por la IA u otro operador).
 *  `link_id` es el uuid PÚBLICO del enlace (el `public_id` del POST y la cola
 *  del `reference` de la fila): es el único identificador que el panel conoce
 *  tras crear uno, y por eso es la clave del anti-eco. Nunca el secreto. */
type EnlacePagoCreadoEvent = SSEEventBase<
  "enlace_pago_creado",
  { link_id: string; amount: string; currency: string; customer_id: string | null }
>;

type ErrorOperativoEvent = SSEEventBase<
  "error_operativo",
  // `event_type` names the operational event that failed; any extra keys are
  // sanitized metadata specific to that event type.
  { source: string; event_type: string; [key: string]: unknown }
>;

type ErrorIntegracionEvent = SSEEventBase<
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
  | PedidoCanceladoEvent
  | PagoRecibidoEvent
  | PagoRechazadoEvent
  | PedidoBorradorCreadoEvent
  | PedidoBorradorActualizadoEvent
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
  | ProductoCreadoEvent
  | ProductoActualizadoEvent
  | ProfesionalCreadoEvent
  | ProfesionalActualizadoEvent
  | ProfesionalEliminadoEvent
  | EnlacePagoCreadoEvent
  | ErrorOperativoEvent
  | ErrorIntegracionEvent;
