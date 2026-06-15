"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Appointment } from "@/lib/types";

interface RescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment;
  onReschedule: (id: string, next: { start: string; end: string }) => Promise<void>;
}

export function RescheduleDialog({
  open,
  onOpenChange,
  appointment,
  onReschedule,
}: RescheduleDialogProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function reset() {
    setDate("");
    setTime("");
    setErrors({});
    setSaving(false);
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!date) e.date = "Requerido";
    if (!time) e.time = "Requerido";
    return e;
  }

  async function handleSave() {
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setSaving(true);
    try {
      const start = new Date(`${date}T${time}:00`);
      const oldDuration =
        new Date(appointment.end).getTime() -
        new Date(appointment.start).getTime();
      const end = new Date(start.getTime() + oldDuration);

      await onReschedule(appointment.id, {
        start: start.toISOString(),
        end: end.toISOString(),
      });
      onOpenChange(false);
    } catch (err) {
      setErrors({
        _form: err instanceof Error ? err.message : "Error al reagendar",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reagendar cita</DialogTitle>
          <DialogDescription>
            Selecciona nueva fecha y hora. La duración se mantiene.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reschedule-date">Nueva fecha</Label>
              <Input
                id="reschedule-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              {errors.date && (
                <p className="text-xs text-destructive">{errors.date}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reschedule-time">Nueva hora</Label>
              <Input
                id="reschedule-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
              {errors.time && (
                <p className="text-xs text-destructive">{errors.time}</p>
              )}
            </div>
          </div>
          {errors._form && (
            <p className="text-sm text-destructive">{errors._form}</p>
          )}
        </div>
        <DialogFooter showCloseButton>
          <Button onClick={handleSave} disabled={saving}>
            <Calendar className="size-4" />
            {saving ? "Reagendando…" : "Reagendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
