import { describe, expect, it } from "vitest";

import { emptyWeek, validateWeek, type DayState } from "@/lib/schedule/windows";

function week(overrides: Record<number, DayState>): DayState[] {
  const w = emptyWeek();
  for (const [i, day] of Object.entries(overrides)) w[Number(i)] = day;
  return w;
}

describe("validateWeek", () => {
  it("accepts an all-closed week (sin horario = siempre abierto)", () => {
    expect(validateWeek(emptyWeek())).toBeNull();
  });

  it("accepts valid non-overlapping ranges", () => {
    const w = week({
      0: {
        open: true,
        ranges: [
          { start: "09:00", end: "13:00" },
          { start: "14:00", end: "18:00" },
        ],
      },
    });
    expect(validateWeek(w)).toBeNull();
  });

  it("rejects start >= end naming the day", () => {
    const w = week({
      1: { open: true, ranges: [{ start: "18:00", end: "09:00" }] },
    });
    expect(validateWeek(w)).toMatch(/^Martes:.*inicio.*anterior/);
  });

  it("rejects overlapping ranges naming the day", () => {
    const w = week({
      5: {
        open: true,
        ranges: [
          { start: "09:00", end: "14:00" },
          { start: "13:00", end: "18:00" },
        ],
      },
    });
    expect(validateWeek(w)).toMatch(/^Sábado:.*superponen/);
  });

  it("ignores invalid ranges on closed days", () => {
    const w = week({
      6: { open: false, ranges: [{ start: "18:00", end: "09:00" }] },
    });
    expect(validateWeek(w)).toBeNull();
  });
});
