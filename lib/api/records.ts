import type { CustomerRecord, RecordValue } from "@/lib/types";

import { api } from "./client";

/** Ficha de un cliente (relación 1:1 vía `customer_id`). */
export function getRecord(customerId: string): Promise<CustomerRecord> {
  return api.get<CustomerRecord>(`/customers/${customerId}/record/`);
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
