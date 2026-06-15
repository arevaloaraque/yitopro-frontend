"use client";

import { useState } from "react";
import { Ban } from "lucide-react";

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

interface CancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment;
  onCancel: (id: string, reason?: string) => Promise<void>;
}

export function CancelDialog({
  open,
  onOpenChange,
  appointment,
  onCancel,
}: CancelDialogProps) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setReason("");
    setSaving(false);
    setError(null);
  }

  async function handleCancel() {
    setSaving(true);
    setError(null);
    try {
      await onCancel(appointment.id, reason.trim() || undefined);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cancelar");
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
          <DialogTitle>Cancelar cita</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de cancelar esta cita? Esta acción no se puede
            deshacer.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
            <Input
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. El cliente canceló"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={saving}
          >
            <Ban className="size-4" />
            {saving ? "Cancelando…" : "Cancelar cita"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
