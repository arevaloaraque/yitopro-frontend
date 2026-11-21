import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a money amount for display. Whole amounts stay clean (no trailing
 * `,00`); non-integers always show exactly 2 decimals so cents render
 * consistently — e.g. 15 → "$15", 15.5 → "$15,50", 15.25 → "$15,25". Backend
 * prices are Decimal(…, 2). Defaults to CLP/es-CL to match the panel; pass
 * `currency`/`locale` for other tenants.
 */
export function formatPrice(
  amount: number,
  currency = "CLP",
  locale = "es-CL",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Display formatting for South American phone numbers. Strips everything but
 * digits (so dashes/parens/spaces in the input don't matter), then groups the
 * national part by country and prefixes `+`. Falls back to `+<digits>` (no
 * spaces) when the number doesn't match the expected shape for its country
 * code — landlines, odd lengths, or codes we don't handle — so nothing gets
 * mangled. Longer codes are checked first (591/593/595/598 before 5X).
 * Fixed-length mobile patterns only; add libphonenumber if the backend ever
 * needs true per-region landline grouping.
 */
const PHONE_FORMATS: { code: string; pattern: RegExp; group: string }[] = [
  { code: "591", pattern: /^(\d{4})(\d{4})$/, group: "$1 $2" }, // BO
  { code: "593", pattern: /^(\d{2})(\d{3})(\d{4})$/, group: "$1 $2 $3" }, // EC
  { code: "595", pattern: /^(\d{3})(\d{3})(\d{3})$/, group: "$1 $2 $3" }, // PY
  { code: "598", pattern: /^(\d{2})(\d{3})(\d{3})$/, group: "$1 $2 $3" }, // UY
  { code: "54", pattern: /^9(\d{2})(\d{4})(\d{4})$/, group: "9 $1 $2 $3" }, // AR (móvil)
  { code: "55", pattern: /^(\d{2})(\d{5})(\d{4})$/, group: "$1 $2 $3" }, // BR
  { code: "56", pattern: /^9(\d{4})(\d{4})$/, group: "9 $1 $2" }, // CL
  { code: "57", pattern: /^(\d{3})(\d{3})(\d{4})$/, group: "$1 $2 $3" }, // CO
  { code: "58", pattern: /^(\d{3})(\d{3})(\d{4})$/, group: "$1 $2 $3" }, // VE
  { code: "51", pattern: /^(\d{3})(\d{3})(\d{3})$/, group: "$1 $2 $3" }, // PE
];

export function formatNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  for (const { code, pattern, group } of PHONE_FORMATS) {
    if (digits.startsWith(code)) {
      const national = digits.slice(code.length);
      if (pattern.test(national)) {
        return `+${code} ${national.replace(pattern, group)}`;
      }
    }
  }
  return `+${digits}`;
}
