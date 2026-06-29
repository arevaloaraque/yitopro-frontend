import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a money amount for display. Shows up to 2 decimals **when present**
 * and keeps whole amounts clean (no trailing `,00`). Backend prices are
 * Decimal(…, 2), so e.g. 15.25 must render as "$15,25" — a previous formatter
 * capped fraction digits at 0 and silently rounded cents away. Defaults to
 * CLP/es-CL to match the panel; pass `currency`/`locale` for other tenants.
 */
export function formatPrice(amount: number, currency = "CLP", locale = "es-CL"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
