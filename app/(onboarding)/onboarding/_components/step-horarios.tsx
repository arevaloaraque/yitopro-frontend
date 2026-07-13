"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { WeekEditor } from "@/components/schedule/week-editor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import {
  DAYS,
  type DayState,
  buildWindows,
  emptyWeek,
  hasValidOpenDay,
  windowsToWeek,
} from "@/lib/schedule/windows";
import { cn } from "@/lib/utils";

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
      setError(err instanceof Error ? err.message : "No se pudo guardar el horario.");
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
    data.weeklySchedule.length > 0 ? windowsToWeek(data.weeklySchedule) : emptyWeek(),
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
      setError(err instanceof Error ? err.message : "No se pudo guardar el horario.");
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
          onClick={() =>
            setWeek(
              PRESET_WEEKDAYS.map((d) => ({
                ...d,
                ranges: d.ranges.map((r) => ({ ...r })),
              })),
            )
          }
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
