"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DAYS, type DayState, type Range } from "@/lib/schedule/windows";

/**
 * Weekly opening-hours grid editor: one row per weekday with an open/closed
 * switch and one or more time ranges. Pure/controlled — shared by the
 * onboarding "horarios" step (per-professional) and the Settings business-hours
 * card. Holds no data source of its own.
 */
export function WeekEditor({
  week,
  onChange,
}: {
  week: DayState[];
  onChange: (week: DayState[]) => void;
}) {
  function patchDay(i: number, patch: Partial<DayState>) {
    onChange(week.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function patchRange(i: number, ri: number, patch: Partial<Range>) {
    patchDay(i, {
      ranges: week[i].ranges.map((r, idx) => (idx === ri ? { ...r, ...patch } : r)),
    });
  }

  function addRange(i: number) {
    patchDay(i, { ranges: [...week[i].ranges, { start: "09:00", end: "18:00" }] });
  }

  function removeRange(i: number, ri: number) {
    patchDay(i, { ranges: week[i].ranges.filter((_, idx) => idx !== ri) });
  }

  return (
    <div className="space-y-2">
      {DAYS.map((day, i) => {
        const state = week[i];
        return (
          <div key={day.index} className="rounded-xl border border-border/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[0.85rem] font-medium text-foreground">
                {day.label}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[0.7rem] text-muted-foreground">
                  {state.open ? "Abierto" : "Cerrado"}
                </span>
                <Switch
                  aria-label={`${day.label} abierto`}
                  checked={state.open}
                  onChange={(checked) => patchDay(i, { open: checked })}
                />
              </div>
            </div>

            {state.open ? (
              <div className="mt-3 space-y-2">
                {state.ranges.map((range, ri) => (
                  <div key={ri} className="flex items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`${day.label} inicio turno ${ri + 1}`}
                      value={range.start}
                      onChange={(e) => patchRange(i, ri, { start: e.target.value })}
                      className="w-32 min-w-[5.5rem]"
                    />
                    <span className="text-muted-foreground">—</span>
                    <Input
                      type="time"
                      aria-label={`${day.label} fin turno ${ri + 1}`}
                      value={range.end}
                      onChange={(e) => patchRange(i, ri, { end: e.target.value })}
                      className="w-32 min-w-[5.5rem]"
                    />
                    {state.ranges.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Eliminar turno ${ri + 1} de ${day.label}`}
                        onClick={() => removeRange(i, ri)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addRange(i)}
                  className="text-[0.75rem]"
                >
                  <Plus className="size-3.5" />
                  Agregar turno
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
