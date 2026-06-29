"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomerCombobox } from "@/components/customers/customer-combobox";
import type { Service } from "@/lib/types";

interface FormData {
  customer_id: string;
  service_id: string;
  date: string;
  time: string;
  duration_minutes: number;
}

const emptyForm: FormData = {
  customer_id: "",
  service_id: "",
  date: "",
  time: "",
  duration_minutes: 0,
};

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
  onCreate: (input: {
    service_id: string;
    customer_id: string;
    start: string;
    end: string;
    notes?: string;
  }) => Promise<void>;
}

function todayStr(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function CreateDialog({
  open,
  onOpenChange,
  services,
  onCreate,
}: CreateDialogProps) {
  const [form, setForm] = useState<FormData>(emptyForm);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function reset() {
    setForm(emptyForm);
    setCustomer(null);
    setErrors({});
    setSaving(false);
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.customer_id) e.customer_id = "Requerido";
    if (!form.service_id) e.service_id = "Requerido";
    if (!form.date) e.date = "Requerido";
    else if (form.date < todayStr()) e.date = "La fecha no puede ser pasada";
    if (!form.time) e.time = "Requerido";
    else if (form.date === todayStr()) {
      const now = new Date();
      const [h, m] = form.time.split(":").map(Number);
      const selected = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
      if (selected <= now) e.time = "La hora no puede ser pasada";
    }
    return e;
  }

  async function handleSave() {
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setSaving(true);
    try {
      const svc = services.find((s) => s.id === form.service_id);
      const duration = svc?.duration_minutes ?? 30;
      const start = new Date(`${form.date}T${form.time}:00`);
      const end = new Date(start.getTime() + duration * 60000);

      await onCreate({
        service_id: form.service_id,
        customer_id: form.customer_id,
        start: start.toISOString(),
        end: end.toISOString(),
      });
      onOpenChange(false);
    } catch (err) {
      setErrors({
        _form: err instanceof Error ? err.message : "Error al crear cita",
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
          <DialogTitle>Nueva cita</DialogTitle>
          <DialogDescription>
            Completa los datos para agendar una cita manualmente.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Cliente</Label>
            <CustomerCombobox
              value={customer}
              onChange={(c) => {
                setCustomer(c);
                setForm((prev) => ({ ...prev, customer_id: c?.id ?? "" }));
              }}
              placeholder="Buscar cliente…"
            />
            {errors.customer_id && (
              <p className="text-xs text-destructive">{errors.customer_id}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-service">Servicio</Label>
            <Select
              value={form.service_id}
              onValueChange={(v) => {
                const svc = services.find((s) => s.id === v);
                setForm((prev) => ({
                  ...prev,
                  service_id: v ?? "",
                  duration_minutes: svc?.duration_minutes ?? 0,
                }));
              }}
            >
              <SelectTrigger id="create-service" className="w-full">
                <SelectValue placeholder="Seleccionar servicio" />
              </SelectTrigger>
              <SelectContent>
                {services
                  .filter((s) => s.is_active)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes} min)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.service_id && (
              <p className="text-xs text-destructive">{errors.service_id}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-date">Fecha</Label>
              <Input
                id="create-date"
                type="date"
                min={todayStr()}
                value={form.date}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, date: e.target.value }))
                }
              />
              {errors.date && (
                <p className="text-xs text-destructive">{errors.date}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-time">Hora</Label>
              <Input
                id="create-time"
                type="time"
                value={form.time}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, time: e.target.value }))
                }
              />
              {errors.time && (
                <p className="text-xs text-destructive">{errors.time}</p>
              )}
            </div>
          </div>
          {form.duration_minutes > 0 && (
            <p className="text-xs text-muted-foreground">
              Duración estimada: {form.duration_minutes} min
            </p>
          )}
          {errors._form && (
            <p className="text-sm text-destructive">{errors._form}</p>
          )}
        </div>
        <DialogFooter showCloseButton>
          <Button onClick={handleSave} disabled={saving}>
            <Plus className="size-4" />
            {saving ? "Creando…" : "Crear cita"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
