import type { CustomerRecord, RecordValue } from "@/lib/types";

import { api } from "./client";

/** A customer's record (1:1 relationship via `customer_id`). */
export function getRecord(customerId: string): Promise<CustomerRecord> {
  return api.get<CustomerRecord>(`/customers/${customerId}/record/`);
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
