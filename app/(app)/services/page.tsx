"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Service } from "@/lib/types";
import {
  searchServices,
  createService,
  updateService,
  deleteService,
} from "@/lib/api";
import { subscribeToEvents } from "@/lib/sse";
import { useMoney } from "@/lib/business";
import { Loading, EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CharCountInput } from "@/components/ui/char-count-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  description: string;
  is_active: boolean;
}

const emptyForm: FormData = {
  name: "",
  duration_minutes: "",
  price: "",
  description: "",
  is_active: true,
};
const PAGE_SIZE = 20;

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
    description: s.description ?? "",
    is_active: s.is_active,
  };
}

export default function ServicesPage() {
  const money = useMoney();
  const [services, setServices] = useState<Service[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Services list: search + server-side pagination ("load more").
  const loadServices = useCallback(
    async (opts: {
      search: string;
      offset: number;
      append: boolean;
      limit?: number;
    }) => {
      setListLoading(true);
      setError(null);
      try {
        const res = await searchServices({
          search: opts.search || undefined,
          limit: opts.limit ?? PAGE_SIZE,
          offset: opts.offset,
        });
        setServices((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setCount(res.count);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar servicios");
      } finally {
        setLoading(false);
        setListLoading(false);
      }
    },
    [],
  );

  // Search debounce; also performs the initial load (offset 0, replace).
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => loadServices({ search, offset: 0, append: false }),
      250,
    );
    return () => clearTimeout(searchTimer.current);
  }, [search, loadServices]);

  // Live refresh: another operator or the onboarding wizard changed the catalog.
  // Subscribe once; read the live search term via a ref to avoid re-subscribing.
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  });
  useEffect(() => {
    return subscribeToEvents((event) => {
      if (
        event.type === "servicio_creado" ||
        event.type === "servicio_actualizado" ||
        event.type === "servicio_eliminado"
      ) {
        loadServices({ search: searchRef.current, offset: 0, append: false });
      }
    });
  }, [loadServices]);

  function refetch() {
    setLoading(true);
    loadServices({ search, offset: 0, append: false });
  }

  function validate(f: FormData): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Requerido";
    if (
      !f.duration_minutes.trim() ||
      isNaN(Number(f.duration_minutes)) ||
      Number(f.duration_minutes) <= 0
    ) {
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
          description: form.description.trim(),
          duration_minutes: Number(form.duration_minutes),
          price: Number(form.price),
        });
        setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        toast.success(`Servicio «${updated.name}» actualizado`);
      } else {
        const created = await createService({
          name: form.name.trim(),
          description: form.description.trim(),
          duration_minutes: Number(form.duration_minutes),
          price: Number(form.price),
          is_active: form.is_active,
        });
        // Prepend: the list is newest-first (backend order_by -id), so a just-created
        // service belongs at the top — appending hid it below the page limit (QA-SERVICIOS-02).
        // filter guards the rare optimistic-add vs SSE-refetch race (duplicate React key).
        setServices((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
        setCount((c) => c + 1);
        toast.success(`Servicio «${created.name}» creado`);
      }
      closeDialog();
    } catch (e) {
      setFormErrors({ _form: e instanceof Error ? e.message : "Error al guardar" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(service: Service) {
    setServices((prev) =>
      prev.map((s) => (s.id === service.id ? { ...s, is_active: !s.is_active } : s)),
    );
    try {
      await updateService(service.id, { is_active: !service.is_active });
      toast.success(
        `Servicio «${service.name}» ${service.is_active ? "desactivado" : "activado"}`,
      );
    } catch {
      setServices((prev) =>
        prev.map((s) =>
          s.id === service.id ? { ...s, is_active: service.is_active } : s,
        ),
      );
      toast.error("No se pudo cambiar el estado del servicio.");
    }
  }

  async function handleDelete(service: Service) {
    // ponytail: confirm() nativo; si diseño pide un Dialog de marca, cambiarlo aquí.
    if (!window.confirm(`¿Eliminar el servicio «${service.name}»?`)) return;
    try {
      await deleteService(service.id);
      setServices((prev) => prev.filter((s) => s.id !== service.id));
      setCount((c) => Math.max(0, c - 1));
      toast.success(`Servicio «${service.name}» eliminado`);
    } catch (e) {
      // 409 (p. ej. citas asociadas): e.message ya trae el mensaje del backend.
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar el servicio.");
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Servicios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Los servicios que ofrece tu negocio.
          </p>
        </div>
        <ErrorState description={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Servicios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Los servicios que ofrece tu negocio.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Nuevo servicio
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar servicio…"
          aria-label="Buscar servicios"
          className="pl-8"
        />
      </div>

      {services.length === 0 ? (
        search ? (
          <EmptyState
            icon={Search}
            title="Sin resultados"
            description={`No hay servicios que coincidan con "${search}".`}
          />
        ) : (
          <EmptyState
            icon={Sparkles}
            title="Sin servicios"
            description="Crea tu primer servicio para empezar a agendar."
            action={
              <Button onClick={openCreate}>
                <Plus className="size-4" />
                Nuevo servicio
              </Button>
            }
          />
        )
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
                    {money(s.price)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={s.is_active}
                        onChange={() => toggleActive(s)}
                        aria-label={
                          s.is_active ? "Desactivar servicio" : "Activar servicio"
                        }
                      />
                      <Badge
                        variant={s.is_active ? "success" : "secondary"}
                        className="text-xs tabular-nums"
                      >
                        {s.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => openEdit(s)}
                        aria-label="Editar servicio"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(s)}
                        aria-label="Eliminar servicio"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {services.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Mostrando {services.length} de {count}
          </span>
          {services.length < count && (
            <Button
              variant="outline"
              size="sm"
              disabled={listLoading}
              onClick={() =>
                loadServices({ search, offset: services.length, append: true })
              }
            >
              {listLoading ? "Cargando…" : "Cargar más"}
            </Button>
          )}
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
              <CharCountInput
                id="svc-name"
                max={255}
                value={form.name}
                onChange={(name) => setForm((prev) => ({ ...prev, name }))}
                placeholder="Ej. Consulta inicial"
                aria-invalid={formErrors.name ? true : undefined}
                describedBy={formErrors.name ? "svc-name-error" : undefined}
              />
              {formErrors.name && (
                <p id="svc-name-error" role="alert" className="text-xs text-destructive">
                  {formErrors.name}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="svc-duration">Duración (minutos)</Label>
                <Input
                  id="svc-duration"
                  type="number"
                  min={1}
                  value={form.duration_minutes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, duration_minutes: e.target.value }))
                  }
                  placeholder="45"
                  aria-invalid={formErrors.duration_minutes ? true : undefined}
                  aria-describedby={
                    formErrors.duration_minutes ? "svc-duration-error" : undefined
                  }
                />
                {formErrors.duration_minutes && (
                  <p
                    id="svc-duration-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {formErrors.duration_minutes}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="svc-price">Precio</Label>
                <Input
                  id="svc-price"
                  type="number"
                  min={1}
                  step="0.01"
                  value={form.price}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, price: e.target.value }))
                  }
                  placeholder="12000"
                  aria-invalid={formErrors.price ? true : undefined}
                  aria-describedby={formErrors.price ? "svc-price-error" : undefined}
                />
                {formErrors.price && (
                  <p
                    id="svc-price-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {formErrors.price}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="svc-description">Descripción (opcional)</Label>
              <Textarea
                id="svc-description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Ej. Incluye baño, secado y corte de uñas"
              />
            </div>
            {creating && (
              <div className="flex items-center gap-2">
                <Switch
                  id="svc-active"
                  checked={form.is_active}
                  onChange={(checked) =>
                    setForm((prev) => ({ ...prev, is_active: checked }))
                  }
                  aria-label="Servicio activo"
                />
                <Label htmlFor="svc-active">
                  {form.is_active ? "Activo" : "Inactivo"}
                </Label>
              </div>
            )}
            {formErrors._form && (
              <p role="alert" className="text-sm text-destructive">
                {formErrors._form}
              </p>
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
