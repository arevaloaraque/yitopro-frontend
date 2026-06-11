import type { ActorType } from "./common";

/** Tipo de un campo de ficha dinámica. */
export type RecordFieldType = "text" | "number" | "select" | "date" | "boolean";

/** Valor posible de un campo de ficha. */
export type RecordValue = string | number | boolean | null;

/** Definición de un campo dentro del schema de una ficha. */
export interface RecordField {
  name: string;
  /** Etiqueta legible para la UI. */
  label: string;
  type: RecordFieldType;
  required: boolean;
  /** Si el agente de IA puede leer este campo. */
  ai_visible: boolean;
  /** Si el agente de IA puede modificar este campo. */
  ai_editable: boolean;
  /** Opciones disponibles cuando `type === "select"`. */
  options?: string[];
}

/** Entrada del historial de cambios de una ficha. */
export interface RecordAuditEntry {
  field: string;
  old_value: RecordValue;
  new_value: RecordValue;
  /** Quién hizo el cambio. */
  changed_by: ActorType;
  /** ISO 8601. */
  changed_at: string;
}

/**
 * Ficha dinámica de un cliente. Reflejo del schema `Record` del backend.
 * Se llama `CustomerRecord` para no colisionar con el `Record<K, V>` de
 * TypeScript.
 */
export interface CustomerRecord {
  id: string;
  customer_id: string;
  /** Definición de campos (varía por negocio). */
  schema: RecordField[];
  /** Valores actuales, indexados por `RecordField.name`. */
  values: { [field: string]: RecordValue };
  /** ISO 8601. */
  updated_at: string;
  audit: RecordAuditEntry[];
}
