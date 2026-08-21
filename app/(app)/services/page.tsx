"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Service } from "@/lib/types";
import { searchServices, createService, updateService, deleteService } from "@/lib/api";
import { subscribeToEvents } from "@/lib/sse";
import { useMoney } from "@/lib/business";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { cn } from "@/lib/utils";
import { Loading, EmptyState, ErrorState } from "@/components/states";
import { FilterBar } from "@/components/filters/filter-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListFooter } from "@/components/ui/list-footer";
import { Switch } from "@/components/ui/switch";
import { CharCountInput } from "@/components/ui/char-count-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogClose,
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

/**
 * El filtro de estado vive en la URL, y ahí solo hay strings. Mismas tres
 * opciones que en productos, escritas otra vez a propósito: son tres líneas y un
 * módulo compartido solo para ellas obligaría a mirar en otro archivo para saber
 * qué dice un desplegable.
 */
const ACTIVE_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "true", label: "Activos" },
  { value: "false", label: "Inactivos" },
];

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

function ServicesPageContent() {
  const money = useMoney();
  const [services, setServices] = useState<Service[]>([]);
  const [count, setCount] = useState(0);
  // El término vive en la URL, así que «los tres servicios de baño» se comparte
  // por chat y sobrevive un reload. Se escribe el valor YA retrasado: el crudo
  // haría un `replaceState` por pulsación.
  const [filters, setFilters] = useUrlFilters({ q: "", active: "all" });
  const activeFilter = filters.active;
  const [search, setSearch] = useState(filters.q);
  const debouncedSearch = useDebounced(search);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    setFilters({ q: debouncedSearch });
  }, [debouncedSearch, setFilters]);

  // Filas en pantalla, leídas por los `catch` y por el handler SSE (que se
  // registra una sola vez).
  const shownRef = useRef(0);
  useEffect(() => {
    shownRef.current = services.length;
  });

  // Services list: search + active filter + server-side pagination ("load more").
  const loadServices = useCallback(
    async (opts: {
      search: string;
      active: string;
      offset: number;
      append: boolean;
      limit?: number;
    }) => {
      setListLoading(true);
      setError(null);
      try {
        const res = await searchServices({
          search: opts.search,
          // «Todos» no es un filtro: se omite el param en vez de mandar los dos
          // valores, que el backend leería como uno concreto.
          active: opts.active === "all" ? undefined : opts.active === "true",
          limit: opts.limit ?? PAGE_SIZE,
          offset: opts.offset,
        });
        setServices((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setCount(res.count);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Error al cargar servicios";
        setError(message);
        // Que falle pedir MÁS filas (o el refresco por SSE) no puede borrar las
        // que ya están en pantalla: el ErrorState solo se dibuja cuando no queda
        // nada que mostrar, y el resto se avisa con un toast.
        if (shownRef.current > 0) toast.error(message);
      } finally {
        setLoading(false);
        setListLoading(false);
      }
    },
    [],
  );

  // El debounce ya vive en el valor, así que este efecto solo reacciona a él:
  // también hace la carga inicial (offset 0, reemplazo). Diferido con
  // `setTimeout(…, 0)` porque pedir dentro del cuerpo del efecto encadena
  // renders (react-hooks/set-state-in-effect), el mismo idioma que pagos.
  useEffect(() => {
    const t = setTimeout(
      () =>
        loadServices({
          search: debouncedSearch,
          active: activeFilter,
          offset: 0,
          append: false,
        }),
      0,
    );
    return () => clearTimeout(t);
  }, [debouncedSearch, activeFilter, loadServices]);

  // Live refresh: another operator or the onboarding wizard changed the catalog.
  // Subscribe once; read the live filters via a ref to avoid re-subscribing. Van
  // los DOS filtros: con solo el término, un `servicio_actualizado` recargaba sin
  // `active` y metía servicios inactivos en una vista de «Activos».
  const filtersRef = useRef({ search: debouncedSearch, active: activeFilter });
  useEffect(() => {
    filtersRef.current = { search: debouncedSearch, active: activeFilter };
  });
  useEffect(() => {
    return subscribeToEvents((event) => {
      if (
        event.type === "servicio_creado" ||
        event.type === "servicio_actualizado" ||
        event.type === "servicio_eliminado"
      ) {
        // `limit` sobre lo ya visible: con PAGE_SIZE a secas, un evento ajeno
        // encogía a 20 filas una lista que el operador había expandido a 80.
        loadServices({
          ...filtersRef.current,
          offset: 0,
          append: false,
          limit: Math.max(shownRef.current, PAGE_SIZE),
        });
      }
    });
  }, [loadServices]);

  function refetch() {
    setLoading(true);
    loadServices({
      search: debouncedSearch,
      active: activeFilter,
      offset: 0,
      append: false,
    });
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
    // `< 0`, no `<= 0`: el backend acepta 0 (`Q(price__gte=0)`) y el wizard de
    // onboarding crea servicios gratuitos. Exigir un precio positivo dejaba esos
    // servicios sin poder editarse desde aquí: corregirles el nombre obligaba a
    // inventarles un precio.
    if (!f.price.trim() || isNaN(Number(f.price)) || Number(f.price) < 0) {
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

  async function confirmDelete() {
    const service = deleteTarget;
    if (!service) return;
    setDeletePending(true);
    try {
      await deleteService(service.id);
      setServices((prev) => prev.filter((s) => s.id !== service.id));
      setCount((c) => Math.max(0, c - 1));
      toast.success(`Servicio «${service.name}» eliminado`);
    } catch (e) {
      // 409 (p. ej. citas asociadas): e.message ya trae el mensaje del backend.
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar el servicio.");
    } finally {
      setDeletePending(false);
      setDeleteTarget(null);
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
  // El vacío se decide por los filtros APLICADOS, no por la lista que devolvió:
  // sin filtros, cero filas significa «todavía no hay catálogo», y con alguno
  // significa «tu filtro no encontró nada». Son dos pantallas distintas, y el
  // estado cuenta igual que el término: «Inactivos» sin resultados no es un
  // negocio sin servicios.
  const searching = debouncedSearch !== "" || activeFilter !== "all";
  // El botón «Limpiar» mira el término CRUDO para aparecer mientras se teclea,
  // sin esperar el debounce.
  const filterBarActive = search !== "" || activeFilter !== "all";

  function clearFilters() {
    setSearch("");
    setFilters({ active: "all" });
  }

  if (loading) return <Loading rows={4} label="Cargando servicios…" />;

  if (error && services.length === 0) {
    return (
      <div className="w-full space-y-6">
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
    <div className="w-full space-y-6">
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

      <FilterBar active={filterBarActive} onClear={clearFilters}>
        <div className="flex flex-col gap-1.5">
          {/* `-filter` en el id: el switch del diálogo de creación ya ocupa
              `svc-active`, y dos ids iguales rompen la asociación etiqueta↔control
              (el clic en «Estado» iría al switch del formulario). */}
          <Label htmlFor="svc-active-filter">Estado</Label>
          {/* `items` no es decoración: sin el mapa valor→etiqueta el disparador
              pinta el valor crudo y el filtro se leería «true». */}
          <Select
            items={ACTIVE_OPTIONS}
            value={activeFilter}
            onValueChange={(v) => setFilters({ active: v ?? "all" })}
          >
            <SelectTrigger id="svc-active-filter" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-72 flex-1 flex-col gap-1.5">
          <Label htmlFor="svc-search">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="svc-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o descripción…"
              className="pl-8"
              aria-describedby="svc-search-hint"
            />
          </div>
          {/* Lo dice porque si no se lee como roto: el backend hace
              `icontains_any(qs, search, "name", "description")`, así que buscar
              «baño» devuelve un servicio llamado «Peluquería canina» que lo
              menciona en su descripción. */}
          <p id="svc-search-hint" className="text-xs text-muted-foreground">
            Busca en el nombre y también en la descripción, así que pueden aparecer
            servicios cuyo nombre no contiene lo que escribiste.
          </p>
        </div>
      </FilterBar>

      {services.length === 0 ? (
        searching ? (
          <EmptyState
            icon={Search}
            title="Sin resultados"
            description={
              // Con el estado como único filtro no hay término que citar, y la
              // frase de búsqueda diría «coincide con «»».
              debouncedSearch !== ""
                ? `Ningún servicio coincide con «${debouncedSearch}», ni por nombre ni por descripción.`
                : "Ningún servicio coincide con estos filtros."
            }
            action={
              <Button variant="outline" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            }
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
        <div className="space-y-2">
          {/* El atenuado por sí solo es señal por color: el texto es lo que
              cuenta lo mismo a quien no la percibe. */}
          {listLoading && (
            <p role="status" className="text-xs text-muted-foreground">
              Actualizando la lista…
            </p>
          )}
          <div
            aria-busy={listLoading || undefined}
            className={cn("transition-opacity", listLoading && "opacity-60")}
          >
            <Table>
              <TableHeader>
                {/* Las columnas CAEN por breakpoint en vez de sobrevivir tras un
                    scroll horizontal: a 375px quedan ~327px útiles y solo el
                    padding de cinco celdas se come 160, así que el scroll dejaba
                    en pantalla «Nombre | Duración» y empujaba fuera precio y
                    estado. El precio reaparece bajo el nombre en móvil. */}
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden w-28 md:table-cell">Duración</TableHead>
                  <TableHead className="hidden w-32 text-right sm:table-cell">
                    Precio
                  </TableHead>
                  <TableHead className="w-28">Estado</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium whitespace-normal">
                      {s.name}
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground tabular-nums sm:hidden">
                        {money(s.price)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatDuration(s.duration_minutes)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {money(s.price)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={s.is_active}
                          onChange={() => toggleActive(s)}
                          aria-label={`${s.is_active ? "Desactivar" : "Activar"} servicio ${s.name}`}
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
                      {/* `icon-sm` (28px) con `gap-2`: el objetivo crece sin que
                          los dos botones se toquen, que es peor que uno pequeño.
                          El nombre va en cada aria-label porque con veinte filas
                          «Editar servicio» se repite veinte veces idéntico. */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(s)}
                          aria-label={`Editar servicio ${s.name}`}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteTarget(s)}
                          aria-label={`Eliminar servicio ${s.name}`}
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
        </div>
      )}

      <ListFooter
        shown={services.length}
        total={count}
        loading={listLoading}
        onLoadMore={() =>
          loadServices({
            search: debouncedSearch,
            active: activeFilter,
            offset: services.length,
            append: true,
          })
        }
      />

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
                <p
                  id="svc-name-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
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
                  min={0}
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

      {/* Un `Dialog` propio y no `window.confirm`: eliminar un servicio lo saca
          del catálogo que ofrece el agente por WhatsApp, y eso hay que poder
          nombrarlo —junto con la alternativa de desactivarlo—, cosa que no cabe
          en un prompt nativo. Es el mismo molde que cancelar un pedido. */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar el servicio «{deleteTarget?.name}»?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `${formatDuration(deleteTarget.duration_minutes)} · ${money(deleteTarget.price)}`
                : null}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Desaparece del catálogo y deja de estar disponible al agendar. Si solo
            quieres dejar de venderlo por un tiempo, desactívalo con el interruptor: se
            conserva y vuelve con un clic. Si ya tiene citas asociadas, el sistema no
            permitirá eliminarlo.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={deletePending} />}>
              Volver
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deletePending}
              onClick={confirmDelete}
            >
              {deletePending && <Loader2 className="size-4 animate-spin" />}
              Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// `useSearchParams` (dentro de `useUrlFilters`) exige un límite de Suspense en el
// App Router.
export default function ServicesPage() {
  return (
    <Suspense fallback={null}>
      <ServicesPageContent />
    </Suspense>
  );
}
