"use client";

import { useCallback } from "react";

import { useBusinessOptional } from "./business-context";
import { formatPrice } from "@/lib/utils";

/**
 * Money formatter bound to the TENANT's currency.
 *
 * `formatPrice` has always accepted a currency, but every call site used its default
 * (`CLP`), so a tenant billing in USD saw its catalogue, its order totals and its
 * service prices rendered as Chilean pesos — wrong figures on the screens an operator
 * quotes from (QA 2026-07-30). The currency lives on the business, which
 * `BusinessProvider` already holds for the whole authenticated shell, so a hook is the
 * shortest correct thing to reach for. It does not *prevent* the mistake — `formatPrice`
 * is still importable — so a new price on a new screen still has to reach for this one.
 *
 * The LOCALE stays Spanish on purpose: the panel is in Spanish for every tenant, so
 * only the currency varies. Before the business loads — or with no provider mounted at all,
 * which is how the page unit tests render these screens — it falls back to `CLP`, the
 * same value the old hardcoded default used, so nothing renders worse than it did.
 */
/** `Intl.NumberFormat` throws `RangeError` on anything that is not a 3-letter code, and
 * this formatter runs inside the products/services/orders tables — a malformed value from
 * the backend would blank the whole screen instead of showing an odd symbol. */
const CURRENCY_CODE = /^[A-Za-z]{3}$/;

export function useMoney(): (amount: number) => string {
  const raw = useBusinessOptional()?.business?.currency;
  const currency = raw && CURRENCY_CODE.test(raw) ? raw : "CLP";
  return useCallback((amount: number) => formatPrice(amount, currency), [currency]);
}
