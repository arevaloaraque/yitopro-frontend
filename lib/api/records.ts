import type { CustomerRecord, RecordField, RecordValue } from "@/lib/types";

import { api } from "./client";

/** A customer's record (1:1 relationship via `customer_id`). */
export function getRecord(customerId: string): Promise<CustomerRecord> {
  return api.get<CustomerRecord>(`/customers/${customerId}/record/`);
}

/** Creates the business's record schema (field definitions). */
export function createRecordSchema(
  name: string,
  fields: RecordField[],
): Promise<{ id: string }> {
  return api
    .post<{ id: number }>("/records/schemas/", { name, fields })
    .then((r) => ({ id: String(r.id) }));
}

/** Updates the record's values; the backend records the `audit`. */
export function updateRecordValues(
  customerId: string,
  values: { [field: string]: RecordValue },
): Promise<CustomerRecord> {
  return api.patch<CustomerRecord>(`/customers/${customerId}/record/`, {
    values,
  });
}
