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
import type { Professional, Service } from "@/lib/types";

interface FormData {
  customer_id: string;
  service_id: string;
  professional_id: string;
  date: string;
  time: string;
  duration_minutes: number;
}

const emptyForm: FormData = {
  customer_id: "",
  service_id: "",
  professional_id: "any",
  date: "",
  time: "",
  duration_minutes: 0,
};

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
  professionals: Professional[];
  onCreate: (input: {
    service_id: string;
    customer_id: string;
    start: string;
    end: string;
    professional_id?: string;
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
  professionals,
  onCreate,
}: CreateDialogProps) {
  const activeProfessionals = professionals.filter((p) => p.is_active);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function reset() {
    setForm(emptyForm);
    setCustomer(null);
    setErrors({});
    setSaving(false);
  }

  /** El campo se está corrigiendo: su error deja de aplicar. */
  function clearError(key: string) {
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
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
        professional_id:
          form.professional_id && form.professional_id !== "any"
            ? form.professional_id
            : undefined,
      });
      reset();
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
            Completa los datos para agendar una cita.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-customer">Cliente</Label>
            <CustomerCombobox
              id="create-customer"
              value={customer}
              onChange={(c) => {
                setCustomer(c);
                setForm((prev) => ({ ...prev, customer_id: c?.id ?? "" }));
                clearError("customer_id");
              }}
              placeholder="Buscar cliente…"
              aria-invalid={errors.customer_id ? true : undefined}
              aria-describedby={
                errors.customer_id ? "create-customer-error" : undefined
              }
            />
            {errors.customer_id && (
              <p
                id="create-customer-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {errors.customer_id}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-service">Servicio</Label>
            <Select
              items={services
                .filter((s) => s.is_active)
                .map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.duration_minutes} min)`,
                }))}
              value={form.service_id}
              onValueChange={(v) => {
                const svc = services.find((s) => s.id === v);
                setForm((prev) => ({
                  ...prev,
                  service_id: v ?? "",
                  duration_minutes: svc?.duration_minutes ?? 0,
                }));
                clearError("service_id");
              }}
            >
              <SelectTrigger
                id="create-service"
                className="w-full"
                aria-invalid={errors.service_id ? true : undefined}
                aria-describedby={
                  errors.service_id ? "create-service-error" : undefined
                }
              >
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
              <p
                id="create-service-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {errors.service_id}
              </p>
            )}
          </div>
          {activeProfessionals.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-professional">Profesional</Label>
              <Select
                items={[
                  { value: "any", label: "Cualquiera (automático)" },
                  ...activeProfessionals.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={form.professional_id}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, professional_id: v ?? "any" }))
                }
              >
                <SelectTrigger id="create-professional" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Cualquiera (automático)</SelectItem>
                  {activeProfessionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-date">Fecha</Label>
              <Input
                id="create-date"
                type="date"
                min={todayStr()}
                value={form.date}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, date: e.target.value }));
                  clearError("date");
                }}
                aria-invalid={errors.date ? true : undefined}
                aria-describedby={errors.date ? "create-date-error" : undefined}
              />
              {errors.date && (
                <p
                  id="create-date-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {errors.date}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-time">Hora</Label>
              <Input
                id="create-time"
                type="time"
                value={form.time}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, time: e.target.value }));
                  clearError("time");
                }}
                aria-invalid={errors.time ? true : undefined}
                aria-describedby={errors.time ? "create-time-error" : undefined}
              />
              {errors.time && (
                <p
                  id="create-time-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {errors.time}
                </p>
              )}
            </div>
          </div>
          {form.duration_minutes > 0 && (
            <p className="text-xs text-muted-foreground">
              Duración estimada: {form.duration_minutes} min
            </p>
          )}
          {errors._form && (
            <p role="alert" className="text-sm text-destructive">
              {errors._form}
            </p>
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
