"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, Loading } from "@/components/states";
import {
  createScheduleBlock,
  deleteScheduleBlock,
  getScheduleBlocks,
} from "@/lib/api/businesses";
import { listProfessionals } from "@/lib/api/professionals";
import type { Professional, ScheduleBlock } from "@/lib/types";

/** Select sentinel for a business-wide block (the API uses professional_id null). */
const ALL = "__all__";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Manual time-off / closures editor. Self-contained card: lists the business's
 * blocks and lets the owner add one (for a professional or the whole business)
 * or remove one. Lives in Settings → Horario, next to the opening hours.
 */
export function ScheduleBlocks() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [pros, setPros] = useState<Professional[]>([]);

  const [who, setWho] = useState<string>(ALL);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [b, p] = await Promise.all([getScheduleBlocks(), listProfessionals()]);
        if (!active) return;
        setBlocks(b);
        setPros(p);
        setLoaded(true);
      } catch (e) {
        if (!active) return;
        setLoadError(e instanceof Error ? e.message : "Error al cargar los bloqueos");
        setLoaded(true);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  async function handleAdd() {
    if (!start || !end) {
      setFormError("Indica el inicio y el fin.");
      return;
    }
    if (new Date(start) >= new Date(end)) {
      setFormError("El inicio debe ser anterior al fin.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await createScheduleBlock({
        professional_id: who === ALL ? null : who,
        start_datetime: new Date(start).toISOString(),
        end_datetime: new Date(end).toISOString(),
        reason: reason.trim(),
      });
      setBlocks((prev) =>
        [...prev, created].sort((a, b) =>
          a.start_datetime.localeCompare(b.start_datetime),
        ),
      );
      setStart("");
      setEnd("");
      setReason("");
      setWho(ALL);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo crear el bloqueo");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const prev = blocks;
    setBlocks((b) => b.filter((x) => x.id !== id)); // optimistic
    try {
      await deleteScheduleBlock(id);
    } catch {
      setBlocks(prev);
      setFormError("No se pudo eliminar el bloqueo.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bloqueos de horario</CardTitle>
        <CardDescription>
          Vacaciones, cierres o ausencias puntuales. Durante un bloqueo no se ofrecen
          citas. Puedes bloquear a un profesional o a todo el negocio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!loaded ? (
          <Loading rows={2} label="Cargando bloqueos…" />
        ) : loadError ? (
          <ErrorState description={loadError} />
        ) : (
          <>
            <div className="grid gap-3 rounded-lg border border-border/40 p-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="blk-who">¿A quién aplica?</Label>
                <Select value={who} onValueChange={(v) => setWho(v ?? who)}>
                  <SelectTrigger id="blk-who" className="w-full">
                    <SelectValue>
                      {(value) =>
                        value === ALL
                          ? "Todo el negocio"
                          : (pros.find((p) => p.id === value)?.name ??
                            "Todo el negocio")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={ALL}>Todo el negocio</SelectItem>
                      {pros.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="blk-start">Desde</Label>
                <Input
                  id="blk-start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="blk-end">Hasta</Label>
                <Input
                  id="blk-end"
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="blk-reason">Motivo (opcional)</Label>
                <Input
                  id="blk-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Vacaciones, feriado…"
                />
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={saving || !start || !end}
                >
                  {saving ? (
                    "Agregando…"
                  ) : (
                    <>
                      <Plus className="size-4" />
                      Agregar bloqueo
                    </>
                  )}
                </Button>
                {formError && <p className="text-xs text-destructive">{formError}</p>}
              </div>
            </div>

            {blocks.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay bloqueos. El negocio está disponible según su horario.
              </p>
            ) : (
              <ul className="space-y-2">
                {blocks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        <span className="font-medium">
                          {b.professional_name || "Todo el negocio"}
                        </span>
                        {b.reason ? ` — ${b.reason}` : ""}
                      </p>
                      <p className="text-[0.65rem] text-muted-foreground tabular-nums">
                        {fmt(b.start_datetime)} → {fmt(b.end_datetime)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground"
                      onClick={() => handleDelete(b.id)}
                      aria-label="Eliminar bloqueo"
                      title="Eliminar bloqueo"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
