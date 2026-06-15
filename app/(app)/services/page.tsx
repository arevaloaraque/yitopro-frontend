"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Scissors } from "lucide-react";
import type { Service } from "@/lib/types";
import { listServices, createService, updateService } from "@/lib/api";
import { Loading, EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FormData {
  name: string;
  duration_minutes: string;
  price: string;
}

const emptyForm: FormData = { name: "", duration_minutes: "", price: "" };

function formatPrice(price: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function serviceToForm(s: Service): FormData {
  return {
    name: s.name,
    duration_minutes: String(s.duration_minutes),
    price: String(s.price),
  };
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listServices();
        if (!cancelled) setServices(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar servicios");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function refetch() {
    setLoading(true);
    setError(null);
    listServices()
      .then(setServices)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar servicios"))
      .finally(() => setLoading(false));
  }

  function validate(f: FormData): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Requerido";
    if (!f.duration_minutes.trim() || isNaN(Number(f.duration_minutes)) || Number(f.duration_minutes) <= 0) {
      errs.duration_minutes = "Duración inválida";
    }
    if (!f.price.trim() || isNaN(Number(f.price)) || Number(f.price) <= 0) {
      errs.price = "Precio inválido";
    }
    return errs;
  }

  async function handleSave() {
    const errs = validate(form);
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      if (editing) {
        const updated = await updateService(editing.id, {
          name: form.name.trim(),
          duration_minutes: Number(form.duration_minutes),
          price: Number(form.price),
        });
        setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      } else {
        const created = await createService({
          name: form.name.trim(),
          duration_minutes: Number(form.duration_minutes),
          price: Number(form.price),
          is_active: true,
        });
        setServices((prev) => [...prev, created]);
      }
      closeDialog();
    } catch (e) {
      setFormErrors({ _form: e instanceof Error ? e.message : "Error al guardar" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(service: Service) {
    setActionError(null);
    setServices((prev) =>
      prev.map((s) =>
        s.id === service.id ? { ...s, is_active: !s.is_active } : s,
      ),
    );
    try {
      await updateService(service.id, { is_active: !service.is_active });
    } catch {
      setServices((prev) =>
        prev.map((s) =>
          s.id === service.id ? { ...s, is_active: service.is_active } : s,
        ),
      );
      setActionError("No se pudo cambiar el estado del servicio.");
    }
  }

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setForm(emptyForm);
    setFormErrors({});
  }

  function openEdit(service: Service) {
    setCreating(false);
    setEditing(service);
    setForm(serviceToForm(service));
    setFormErrors({});
  }

  function closeDialog() {
    setCreating(false);
    setEditing(null);
    setForm(emptyForm);
    setFormErrors({});
    setSaving(false);
  }

  const dialogOpen = creating || editing !== null;

  if (loading) return <Loading rows={4} label="Cargando servicios…" />;

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Servicios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Los servicios que ofrece tu negocio.</p>
        </div>
        <ErrorState description={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Servicios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Los servicios que ofrece tu negocio.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Nuevo servicio
        </Button>
      </div>

      {actionError && (
        <p className="text-sm text-destructive">{actionError}</p>
      )}

      {services.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="Sin servicios"
          description="Crea tu primer servicio para empezar a agendar."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Nuevo servicio
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="w-28">Duración</TableHead>
                <TableHead className="w-32 text-right">Precio</TableHead>
                <TableHead className="w-28">Estado</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDuration(s.duration_minutes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(s.price)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={s.is_active}
                        onChange={() => toggleActive(s)}
                        aria-label={s.is_active ? "Desactivar servicio" : "Activar servicio"}
                      />
                      <Badge variant={s.is_active ? "default" : "secondary"} className="text-xs tabular-nums">
                        {s.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => openEdit(s)}
                      aria-label="Editar servicio"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creating ? "Nuevo servicio" : "Editar servicio"}</DialogTitle>
            <DialogDescription>
              {creating
                ? "Completa los datos del nuevo servicio."
                : "Modifica los datos del servicio."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="svc-name">Nombre</Label>
              <Input
                id="svc-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ej. Consulta inicial"
              />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="svc-duration">Duración (minutos)</Label>
                <Input
                  id="svc-duration"
                  type="number"
                  min={1}
                  value={form.duration_minutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, duration_minutes: e.target.value }))}
                  placeholder="45"
                />
                {formErrors.duration_minutes && (
                  <p className="text-xs text-destructive">{formErrors.duration_minutes}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="svc-price">Precio</Label>
                <Input
                  id="svc-price"
                  type="number"
                  min={1}
                  value={form.price}
                  onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                  placeholder="12000"
                />
                {formErrors.price && <p className="text-xs text-destructive">{formErrors.price}</p>}
              </div>
            </div>
            {formErrors._form && (
              <p className="text-sm text-destructive">{formErrors._form}</p>
            )}
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : creating ? "Crear" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
