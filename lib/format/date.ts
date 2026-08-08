/**
 * Date formatting for lists and detail views.
 *
 * The panel had EIGHT private copies of this logic across as many screens, in three
 * mutually inconsistent dialects (`hace 5m` / `5m` / `hace 5 min`), none exported.
 * New code imports from here instead of adding a ninth; migrating the existing eight
 * is a separate job.
 */

const LOCALE = "es-CL";

/** `31 jul, 14:32` — absolute, for tooltips and detail views. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `ahora` / `hace 5m` / `hace 3h` / `hace 2d`. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

/**
 * Relative while it still reads as "recent", absolute after that.
 *
 * A list column is where this matters: `hace 3h` answers "did this just happen?" at a
 * glance, but `hace 47d` doesn't answer anything — past a day the operator wants the
 * date. The cutoff is 24h because that is where `relativeTime` itself switches to days.
 */
export function listDate(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  if (ageMs < 86_400_000) return relativeTime(iso);
  return new Date(iso).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
  });
}
