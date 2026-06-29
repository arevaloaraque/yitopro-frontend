import type { CustomerRecord, RecordField, RecordValue } from "@/lib/types";

import { api } from "./client";

/** Ficha de un cliente (relación 1:1 vía `customer_id`). */
export function getRecord(customerId: string): Promise<CustomerRecord> {
  return api.get<CustomerRecord>(`/customers/${customerId}/record/`);
}

/** Crea el schema de fichas del negocio (definición de campos). */
export function createRecordSchema(
  name: string,
  fields: RecordField[],
): Promise<{ id: string }> {
  return api
    .post<{ id: number }>("/records/schemas/", { name, fields })
    .then((r) => ({ id: String(r.id) }));
}

/** Actualiza los valores de la ficha; el backend registra el `audit`. */
export function updateRecordValues(
  customerId: string,
  values: { [field: string]: RecordValue },
): Promise<CustomerRecord> {
  return api.patch<CustomerRecord>(`/customers/${customerId}/record/`, {
    values,
  });
}
