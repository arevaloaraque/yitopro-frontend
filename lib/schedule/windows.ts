import type { ScheduleWindow } from "@/lib/types";

/** A time range within a day (UI-local, "HH:MM"). */
export interface Range {
  start: string;
  end: string;
}

/** Editable state for one weekday: open flag + one or more ranges. */
export interface DayState {
  open: boolean;
  ranges: Range[];
}

/** day_of_week index 0=Mon … 6=Sun (matches the backend ScheduleWindow). */
export const DAYS: { index: number; label: string }[] = [
  { index: 0, label: "Lunes" },
  { index: 1, label: "Martes" },
  { index: 2, label: "Miércoles" },
  { index: 3, label: "Jueves" },
  { index: 4, label: "Viernes" },
  { index: 5, label: "Sábado" },
  { index: 6, label: "Domingo" },
];

export function emptyWeek(): DayState[] {
  return DAYS.map(() => ({ open: false, ranges: [{ start: "09:00", end: "18:00" }] }));
}

/**
 * Builds the flat `ScheduleWindow[]` the backend expects from the weekly grid:
 * one entry per open day per range, keeping only ranges where start < end.
 */
export function buildWindows(week: DayState[]): ScheduleWindow[] {
  const windows: ScheduleWindow[] = [];
  week.forEach((day, i) => {
    if (!day.open) return;
    for (const range of day.ranges) {
      if (range.start && range.end && range.start < range.end) {
        windows.push({
          day_of_week: DAYS[i].index,
          start_time: range.start,
          end_time: range.end,
        });
      }
    }
  });
  return windows;
}

/** Inverse of buildWindows: hydrate the grid from saved windows. */
export function windowsToWeek(windows: ScheduleWindow[]): DayState[] {
  const week: DayState[] = DAYS.map(() => ({ open: false, ranges: [] }));
  for (const w of windows) {
    const i = DAYS.findIndex((d) => d.index === w.day_of_week);
    if (i < 0) continue;
    week[i].open = true;
    week[i].ranges.push({ start: w.start_time, end: w.end_time });
  }
  // Restore default range for any open day left without ranges, and a default
  // range for closed days so toggling them on shows a sensible starting value.
  return week.map((d) =>
    d.ranges.length > 0
      ? d
      : { open: d.open, ranges: [{ start: "09:00", end: "18:00" }] },
  );
}

export function hasValidOpenDay(week: DayState[]): boolean {
  return buildWindows(week).length > 0;
}

/**
 * Validates the weekly grid before saving, so invalid ranges surface as an
 * inline error instead of being silently dropped by `buildWindows`:
 * every range of an open day needs start < end, and ranges within the same
 * day must not overlap. Returns a Spanish message naming the day, or null.
 */
export function validateWeek(week: DayState[]): string | null {
  for (let i = 0; i < week.length; i++) {
    const day = week[i];
    if (!day.open) continue;
    const label = DAYS[i].label;
    for (const r of day.ranges) {
      if (!r.start || !r.end || r.start >= r.end) {
        return `${label}: la hora de inicio debe ser anterior a la de término.`;
      }
    }
    // "HH:MM" compares correctly as a string.
    const sorted = [...day.ranges].sort((a, b) => a.start.localeCompare(b.start));
    for (let j = 1; j < sorted.length; j++) {
      if (sorted[j].start < sorted[j - 1].end) {
        return `${label}: los rangos de horario se superponen.`;
      }
    }
  }
  return null;
}
