"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProfessionalSchedule } from "@/lib/api";
import { useOnboarding } from "@/lib/onboarding";
import type { ScheduleWindow } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A time range within a day (UI-local). */
interface Range {
  start: string;
  end: string;
}

/** Editable state for one weekday: open flag + one or more ranges. */
interface DayState {
  open: boolean;
  ranges: Range[];
}

/** day_of_week index 0=Mon … 6=Sun (matches the backend ScheduleWindow). */
const DAYS: { index: number; label: string }[] = [
  { index: 0, label: "Lunes" },
  { index: 1, label: "Martes" },
  { index: 2, label: "Miércoles" },
  { index: 3, label: "Jueves" },
  { index: 4, label: "Viernes" },
  { index: 5, label: "Sábado" },
  { index: 6, label: "Domingo" },
];

function emptyWeek(): DayState[] {
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
function windowsToWeek(windows: ScheduleWindow[]): DayState[] {
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

function hasValidOpenDay(week: DayState[]): boolean {
  return buildWindows(week).length > 0;
}

// ── Day editor (shared by the global grid and per-professional overrides) ──────

function WeekEditor({
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
      ranges: week[i].ranges.map((r, idx) =>
        idx === ri ? { ...r, ...patch } : r,
      ),
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
          <div
            key={day.index}
            className="rounded-xl border border-border/40 p-3"
          >
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
                      onChange={(e) =>
                        patchRange(i, ri, { start: e.target.value })
                      }
                      className="w-32"
                    />
                    <span className="text-muted-foreground">—</span>
                    <Input
                      type="time"
                      aria-label={`${day.label} fin turno ${ri + 1}`}
                      value={range.end}
                      onChange={(e) =>
                        patchRange(i, ri, { end: e.target.value })
                      }
                      className="w-32"
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

// ── Per-professional override (collapsed by default) ──────────────────────────

function ProfessionalOverride() {
  const { data, saveProfessionalSchedule } = useOnboarding();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [week, setWeek] = useState<DayState[]>(emptyWeek);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const latestSelectedRef = useRef<string>("");

  if (data.professionals.length === 0) return null;

  function selectProfessional(id: string) {
    setSelectedId(id);
    latestSelectedRef.current = id;
    setSaved(false);
    setError(null);
    // Seed from cached context first (instant), then override with server data
    setWeek(windowsToWeek(data.professionalSchedules[id] ?? []));
    // Fetch from server (may differ if saved before this session)
    getProfessionalSchedule(id)
      .then((windows) => {
        if (latestSelectedRef.current !== id) return; // stale response — ignore
        setWeek(windowsToWeek(windows));
      })
      .catch(() => {}); // non-fatal
  }

  async function handleSave() {
    if (!selectedId) {
      setError("Selecciona un profesional.");
      return;
    }
    if (!hasValidOpenDay(week)) {
      setError("Marca al menos un día con un horario válido.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveProfessionalSchedule(selectedId, buildWindows(week));
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el horario.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <span className="text-[0.85rem] font-medium text-foreground">
          ¿Algún profesional con horario distinto?
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border/40 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Profesional</Label>
            <Select
              value={selectedId}
              onValueChange={(v) => selectProfessional(v ?? "")}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder="Selecciona un profesional">
                  {(value: string | null) => {
                    const p = data.professionals.find((pro) => pro.id === value);
                    return p ? p.name || "(sin nombre)" : "Selecciona un profesional";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {data.professionals.map((pro) => (
                    <SelectItem key={pro.id} value={pro.id}>
                      {pro.name || "(sin nombre)"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {selectedId ? (
            <>
              <WeekEditor week={week} onChange={setWeek} />
              {error ? (
                <p role="alert" className="text-[0.8rem] text-destructive">
                  {error}
                </p>
              ) : null}
              {saved ? (
                <p className="text-[0.8rem] text-success">Horario guardado.</p>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Guardar horario del profesional
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Main step ─────────────────────────────────────────────────────────────────

const PRESET_WEEKDAYS: DayState[] = DAYS.map((_, i) => ({
  open: i <= 4, // Lun–Vie
  ranges: [{ start: "09:00", end: "18:00" }],
}));

export function StepHorarios() {
  const { data, saveWeeklySchedule } = useOnboarding();
  const [week, setWeek] = useState<DayState[]>(() =>
    data.weeklySchedule.length > 0
      ? windowsToWeek(data.weeklySchedule)
      : emptyWeek(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Once the context finishes loading and weeklySchedule is populated (from the
  // server rehydration), seed the week grid. We only do this on the first
  // non-empty delivery so we don't clobber edits the user has already made.
  const seededRef = useRef(data.weeklySchedule.length > 0);
  useEffect(() => {
    if (seededRef.current) return;
    if (data.weeklySchedule.length > 0) {
      seededRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loading guard pattern
      setWeek(windowsToWeek(data.weeklySchedule));
    }
  }, [data.weeklySchedule]);

  async function handleApplyAll() {
    if (!hasValidOpenDay(week)) {
      setError("Marca al menos un día con un horario válido (inicio < fin).");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveWeeklySchedule(buildWindows(week));
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el horario.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.75rem] text-muted-foreground">Presets:</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeek(PRESET_WEEKDAYS.map((d) => ({ ...d, ranges: d.ranges.map((r) => ({ ...r })) })))}
        >
          Lun–Vie 9:00–18:00
        </Button>
      </div>

      <WeekEditor week={week} onChange={setWeek} />

      {error ? (
        <p role="alert" className="text-[0.8rem] text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-[0.8rem] text-success">
          Horario aplicado a todos los profesionales.
        </p>
      ) : null}

      <Button onClick={handleApplyAll} disabled={saving} className="w-full">
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        Aplicar a todos los profesionales
      </Button>

      <ProfessionalOverride />
    </div>
  );
}
