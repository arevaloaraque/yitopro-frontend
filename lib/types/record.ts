import type { ActorType } from "./common";

/** Type of a dynamic record field. */
export type RecordFieldType = "text" | "number" | "select" | "date" | "boolean";

/** Possible value of a record field. */
export type RecordValue = string | number | boolean | null;

/** Definition of a field within a record's schema. */
export interface RecordField {
  name: string;
  /** Human-readable label for the UI. */
  label: string;
  type: RecordFieldType;
  required: boolean;
  /** Whether the AI agent can read this field. */
  ai_visible: boolean;
  /** Whether the AI agent can modify this field. */
  ai_editable: boolean;
  /** Available options when `type === "select"`. */
  options?: string[];
}

/** Entry in a record's change history. */
export interface RecordAuditEntry {
  field: string;
  old_value: RecordValue;
  new_value: RecordValue;
  /** Who made the change. */
  changed_by: ActorType;
  /** ISO 8601. */
  changed_at: string;
}

/**
 * Dynamic customer record. Mirror of the backend's `Record` schema.
 * It is named `CustomerRecord` to avoid colliding with TypeScript's
 * `Record<K, V>`.
 */
export interface CustomerRecord {
  id: string;
  customer_id: string;
  /** Field definitions (vary per business). */
  schema: RecordField[];
  /** Current values, indexed by `RecordField.name`. */
  values: { [field: string]: RecordValue };
  /** ISO 8601. */
  updated_at: string;
  audit: RecordAuditEntry[];
}
