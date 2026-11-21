import type { CustomerRecord, RecordValue } from "@/lib/types";

import { api } from "./client";

/**
 * A customer's record (1:1 relationship via `customer_id`). `null` when the
 * business has no record schema: the backend answers 204 and the client maps
 * an empty body to `null`.
 */
export function getRecord(customerId: string): Promise<CustomerRecord | null> {
  return api.get<CustomerRecord | null>(`/customers/${customerId}/record/`);
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
