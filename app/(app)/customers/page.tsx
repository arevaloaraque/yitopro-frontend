"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CharCountInput } from "@/components/ui/char-count-input";
import { CustomerRating } from "@/components/customers/rating";
import { FilterBar } from "@/components/filters/filter-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListFooter } from "@/components/ui/list-footer";
import { RowOpenButton } from "@/components/ui/row-open-button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { CustomerDrawer } from "@/components/customers/customer-drawer";
import {
  DEFAULT_CUSTOMER_ORDERING,
  searchCustomers,
  createCustomer,
  type CustomerOrdering,
  type CustomerSearchParams,
} from "@/lib/api/customers";
import { formatDateTime, listDate } from "@/lib/format/date";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { subscribeToEvents } from "@/lib/sse";
import { cn } from "@/lib/utils";
import type { Customer } from "@/lib/types";

type PageState = "loading" | "error" | "ready";

interface FormData {
  name: string;
  phone: string;
  email: string;
}

const emptyForm: FormData = { name: "", phone: "", email: "" };

const PAGE_SIZE = 20;

/**
 * Lo que la URL puede llevar, y su valor por defecto. `useUrlFilters` omite todo
 * lo que valga esto, así que la lista sin filtrar sigue siendo `/customers`
 * pelado, y preserva el `?id=` del drawer, que no gestiona.
 */
const DEFAULT_FILTERS = {
  q: "",
  sort: DEFAULT_CUSTOMER_ORDERING as string,
  from: "",
  to: "",
};

/**
 * Las seis direcciones del enum del backend, nombradas.
 *
 * **Es un `Select` en la barra de filtros y no cabeceras de tabla ordenables**, y
 * la razón no es simplicidad:
 *
 * 1. Dos de las cuatro columnas se CAEN por breakpoint (`Teléfono` en `sm`,
 *    `Creado` en `md`). Con el gesto colgado de la cabecera, en un teléfono no
 *    existiría la forma de ordenar por fecha: el control no está en pantalla.
 * 2. El orden es del SERVIDOR sobre las N filas del negocio, no sobre las 20
 *    cargadas. Una flecha en la cabecera se lee como «ordena lo que veo», que es
 *    justo la confusión que el informe pedía evitar.
 * 3. Y así el orden vive donde el operador ya aprendió a mirar en las otras seis
 *    pantallas, junto a «Limpiar», que también lo devuelve a su default.
 *
 * Esta lista es además con la que se sanea el `?sort=` de la URL: solo se puede
 * caer en un orden que la pantalla sepa NOMBRAR (el tipo `CustomerOrdering` es lo
 * que garantiza que el backend lo acepta).
 */
const SORTS: { value: CustomerOrdering; label: string }[] = [
  { value: "-created_at", label: "Más recientes" },
  { value: "created_at", label: "Más antiguos" },
  { value: "display_name", label: "Nombre (A-Z)" },
  { value: "-display_name", label: "Nombre (Z-A)" },
  { value: "-rating_avg", label: "Mejor calificados" },
  { value: "rating_avg", label: "Peor calificados" },
];

/**
 * «Hoy» en la zona horaria del operador, para el `max` de los dos campos.
 *
 * `toISOString().slice(0,10)` daría el día UTC mientras la ventana se interpreta
 * a medianoche LOCAL (ver `dayIso` en `lib/api/customers.ts`): en Chile, pasadas
 * las 20:00, el campo «hasta» tendría un `max` de ayer y el navegador daría por
 * inválido el día en curso. `sv-SE` es el locale que formatea `YYYY-MM-DD`, que
 * es lo que un `<input type="date">` acepta.
 *
 * Copia de la de `/payments`; el hogar compartido de estos helpers de fecha es
 * otra tarea (ver la nota de `lib/format/date.ts`).
 */
function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/** Cómo se nombra el periodo puesto, para el vacío «sin resultados». Vacío = sin
 *  periodo. Las fechas se dicen tal como las muestra el control (`YYYY-MM-DD`) a
 *  propósito: el operador tiene que poder reconocer el campo que las contiene. */
function periodText(from: string, to: string): string {
  if (from && to) return `entre el ${from} y el ${to}`;
  if (from) return `desde el ${from}`;
  if (to) return `hasta el ${to}`;
  return "";
}

/** Lo que `loadCustomers` necesita saber del filtro; el resto (`limit`/`offset`)
 *  es de la paginación y lo pone cada llamada. */
type ListQuery = Omit<CustomerSearchParams, "limit" | "offset">;

function CustomersPageContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<PageState>("loading");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [count, setCount] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Búsqueda, orden y periodo viven en la URL: una lista filtrada se comparte y
  // sobrevive un reload. A la URL va el término YA retrasado — escribir el crudo
  // haría un `replaceState` por pulsación.
  const [filters, setFilters] = useUrlFilters(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState(filters.q);
  const search = useDebounced(searchInput, 250);
  useEffect(() => {
    setFilters({ q: search });
  }, [search, setFilters]);

  // El `ordering` es un enum cerrado y un valor inventado responde 422: se sanea
  // aquí en vez de reenviar lo que traiga la URL, que dejaría la pantalla en
  // estado de error por un parámetro escrito a mano.
  const sort =
    SORTS.find((s) => s.value === filters.sort)?.value ?? DEFAULT_CUSTOMER_ORDERING;
  const sortsByRating = sort === "rating_avg" || sort === "-rating_avg";

  // Los dos campos de fecha son independientes: cada uno vale solo («desde el 1»
  // sin tope es una consulta legítima), así que se enlazan directo a la URL y no
  // hay pares a medio escribir que retener — a diferencia de `/payments`, donde
  // el resumen EXIGE los dos. Lo único imposible es un final anterior al inicio,
  // y ahí el periodo NO se aplica: mandarlo al revés devolvería cero filas y se
  // leería como «este negocio no tiene clientes».
  const windowError =
    filters.from && filters.to && filters.to < filters.from
      ? "La fecha final es anterior a la inicial: el periodo no se está aplicando."
      : "";
  // Cómo se nombra el periodo VIGENTE (vacío si no se está aplicando): lo usa el
  // vacío «sin resultados» para señalar cuál de los dos filtros dejó la tabla en
  // cero. Un «no hay clientes» pelado con un rango de fechas olvidado arriba es
  // exactamente la pantalla que se reporta como rota.
  const period = windowError ? "" : periodText(filters.from, filters.to);

  // The customer whose detail drawer is open (null = closed). Seeded from `?id=` so
  // other screens can link straight to a person — the orders detail links here to
  // answer "who is this?" without making the operator search for them by hand.
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(() =>
    searchParams.get("id"),
  );

  // `replaceState`, not `router.push`: pushing would re-render the route and refetch the
  // whole list just to open a drawer (same reasoning as the conversations inbox).
  // Se parte de los params vigentes en vez de escribir `?id=…` a secas: eso borraba
  // el `?q=` del buscador, así que abrir una ficha desde una lista filtrada dejaba
  // una URL que ya no reproduce lo que hay en pantalla. Es la simétrica de la que
  // `useUrlFilters` hace por el `id`.
  const setIdParam = useCallback((id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("id", id);
    else params.delete("id");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, []);

  const openCustomer = useCallback(
    (id: string) => {
      setOpenCustomerId(id);
      setIdParam(id);
    },
    [setIdParam],
  );

  const closeCustomer = useCallback(() => {
    setOpenCustomerId(null);
    setIdParam(null);
  }, [setIdParam]);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Lo que se le pide al servidor. Un objeto y no cuatro parámetros sueltos: lo
  // consumen la carga inicial, «Cargar más» y el refetch por SSE, y las tres
  // tienen que pedir EXACTAMENTE el mismo recorte — un «Cargar más» que se
  // olvidara del orden traería la página 2 de otra lista.
  const listQuery = useMemo<ListQuery>(
    () => ({
      search: search || undefined,
      ordering: sort,
      createdFrom: windowError ? undefined : filters.from || undefined,
      createdTo: windowError ? undefined : filters.to || undefined,
    }),
    // Dependencias primitivas y no el objeto `filters`: el hook devuelve un
    // objeto nuevo en cada `set`, y con su identidad en las deps una escritura de
    // URL que no cambia ningún valor pediría la lista otra vez.
    [search, sort, windowError, filters.from, filters.to],
  );

  // Customer list: filtros + server-side pagination ("load more").
  const loadCustomers = useCallback(
    async (opts: {
      query: ListQuery;
      offset: number;
      append: boolean;
      limit?: number;
    }) => {
      setListLoading(true);
      setError(null);
      try {
        const res = await searchCustomers({
          ...opts.query,
          limit: opts.limit ?? PAGE_SIZE,
          offset: opts.offset,
        });
        setCustomers((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setCount(res.count);
        setState("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar clientes");
        setState("error");
      } finally {
        setListLoading(false);
      }
    },
    [],
  );

  // El filtro ya viene reposado (el término, retrasado), así que el fetch se
  // deriva de él: cada recorte nuevo vuelve a la primera página.
  // `setTimeout(…, 0)`: saca el `setState` del camino síncrono del efecto
  // (react-hooks/set-state-in-effect), el mismo idioma que pagos y productos.
  useEffect(() => {
    const t = setTimeout(
      () => loadCustomers({ query: listQuery, offset: 0, append: false }),
      0,
    );
    return () => clearTimeout(t);
  }, [listQuery, loadCustomers]);

  // Live refresh: another operator (or the WhatsApp auto-create) added/edited a
  // customer. Subscribe once; read the live filters via a ref so we don't
  // re-subscribe on every keystroke. Back to the first page (low-frequency event).
  const queryRef = useRef(listQuery);
  const shownRef = useRef(0);
  useEffect(() => {
    queryRef.current = listQuery;
    shownRef.current = customers.length;
  });
  useEffect(() => {
    return subscribeToEvents((event) => {
      if (event.type === "cliente_creado" || event.type === "cliente_actualizado") {
        loadCustomers({
          query: queryRef.current,
          offset: 0,
          append: false,
          // Vuelve a pedir lo que había en pantalla, no una página: con `PAGE_SIZE`
          // fijo, a quien había pulsado «Cargar más» tres veces se le encogía la
          // lista de 80 filas a 20 porque otro operador tocó un cliente.
          limit: Math.max(shownRef.current, PAGE_SIZE),
        });
      }
    });
  }, [loadCustomers]);

  function refetch() {
    loadCustomers({ query: listQuery, offset: 0, append: false });
  }

  /** Vuelve a los defaults: también el orden, que es lo que un «Limpiar» que
   *  dejara la tabla ordenada por otra cosa no explicaría. */
  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setSearchInput("");
  }

  function validate(f: FormData): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Requerido";
    else if (f.name.trim().length > 120) errs.name = "Máximo 120 caracteres";
    if (!f.phone.trim()) errs.phone = "Requerido";
    else if (!/^\+?[\d\s-]{7,15}$/.test(f.phone.trim()))
      errs.phone = "Teléfono inválido";
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
      errs.email = "Email inválido";
    return errs;
  }

  async function handleCreate() {
    const errs = validate(form);
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const { created } = await createCustomer({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
      });
      closeCreate();
      // Mismo criterio que el refetch por SSE: crear un cliente no puede encoger
      // la lista que el operador ya había cargado.
      loadCustomers({
        query: listQuery,
        offset: 0,
        append: false,
        limit: Math.max(customers.length, PAGE_SIZE),
      });
      if (created) {
        toast.success("Cliente creado");
      } else {
        toast.warning("Ya existía un cliente con ese teléfono", {
          description:
            "Se muestra el registro existente; los datos escritos no se guardaron.",
        });
      }
    } catch (e) {
      setFormErrors({
        _form: e instanceof Error ? e.message : "Error al guardar",
      });
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setCreating(true);
    setForm(emptyForm);
    setFormErrors({});
  }

  function closeCreate() {
    setCreating(false);
    setForm(emptyForm);
    setFormErrors({});
    setSaving(false);
  }

  /** Reflect a drawer save back into the list row. */
  function handleCustomerSaved(updated: Customer) {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  if (state === "loading") return <Loading rows={6} label="Cargando clientes…" />;

  if (state === "error") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tus clientes y sus datos.
          </p>
        </div>
        <ErrorState description={error ?? "Error desconocido"} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tus clientes y sus datos.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Nuevo cliente
        </Button>
      </div>

      {/* Orden y periodo los resuelve el SERVIDOR (`ordering`, `created_from`,
          `created_to`): ordenar o recortar en cliente sobre 20 filas de N daría «el
          peor calificado» de la página, no del negocio. */}
      <FilterBar
        active={
          searchInput !== "" ||
          filters.from !== "" ||
          filters.to !== "" ||
          sort !== DEFAULT_CUSTOMER_ORDERING
        }
        onClear={clearFilters}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cust-sort">Ordenar por</Label>
          {/* `items` no es decoración: sin el mapa valor→etiqueta el disparador
              pinta el valor crudo, o sea que el control se llamaría
              «-created_at». */}
          <Select
            items={SORTS}
            value={sort}
            onValueChange={(v) => setFilters({ sort: (v as string) ?? sort })}
          >
            <SelectTrigger
              id="cust-sort"
              className="w-48"
              aria-describedby={sortsByRating ? "cust-sort-hint" : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* El backend deja los no calificados al final EN LOS DOS SENTIDOS, y
              hay que decirlo: con «Peor calificados» puesto, quien viera arriba a
              los que sí tienen nota y abajo a los que no, concluiría que la lista
              está mal ordenada — o peor, que no tener nota es la mejor nota. */}
          {sortsByRating && (
            <p id="cust-sort-hint" className="max-w-64 text-xs text-muted-foreground">
              Los clientes sin calificar van al final en los dos sentidos: no tener
              calificación no es una calificación baja.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cust-from">Creado entre</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="cust-from"
              type="date"
              value={filters.from}
              max={filters.to || todayISO()}
              onChange={(e) => setFilters({ from: e.target.value })}
              className="w-auto"
              aria-label="Creado desde"
              aria-invalid={windowError ? true : undefined}
              aria-describedby="cust-window-hint"
            />
            <span className="text-sm text-muted-foreground">a</span>
            <Input
              id="cust-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              max={todayISO()}
              onChange={(e) => setFilters({ to: e.target.value })}
              className="w-auto"
              aria-label="Creado hasta"
              aria-invalid={windowError ? true : undefined}
              aria-describedby="cust-window-hint"
            />
          </div>
          {/* «Los dos días incluidos» es una promesa que hay que sostener: la cota
              superior del backend es exclusiva y la suma del día la hace
              `lib/api/customers.ts`. */}
          <p
            id="cust-window-hint"
            role={windowError ? "alert" : undefined}
            className={
              windowError
                ? "max-w-64 text-xs text-destructive"
                : "max-w-64 text-xs text-muted-foreground"
            }
          >
            {windowError ||
              "Los dos días incluidos. Cualquiera de las dos fechas puede ir sola."}
          </p>
        </div>

        <div className="flex min-w-72 flex-1 flex-col gap-1.5">
          <Label htmlFor="cust-search">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="cust-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nombre o teléfono…"
              aria-label="Buscar clientes"
              aria-describedby="cust-search-hint"
              className="pl-8"
            />
          </div>
          {/* El backend busca en nombre y teléfono, no en el email. Sin decirlo,
              escribir un correo conocido devuelve cero filas y la pantalla se lee
              como rota o como que el cliente no existe. */}
          <p id="cust-search-hint" className="text-xs text-muted-foreground">
            Busca por nombre o teléfono. El email no entra en la búsqueda.
          </p>
        </div>
      </FilterBar>

      {/* Acompañante textual del atenuado de la tabla: un cambio de opacidad no le
          dice nada a quien no lo distingue, y `aria-busy` solo habla con el lector
          de pantalla. `min-h-4` reserva su alto para que la tabla no salte con cada
          pulsación. */}
      <p role="status" className="min-h-4 text-xs text-muted-foreground">
        {listLoading ? "Actualizando…" : ""}
      </p>

      {customers.length === 0 ? (
        // El orden NO entra en esta condición: cambiar de orden no puede vaciar la
        // lista, solo reordenarla. Los que sí pueden dejarla en cero son el término
        // y el periodo, y son los dos que el botón tiene que poder deshacer.
        // `period` y no `filters.from`: con un rango invertido el periodo no se
        // aplica, así que cero filas ahí significa «no hay clientes», no «tu filtro
        // no encontró nada».
        search || period ? (
          <EmptyState
            icon={Search}
            title="Sin resultados"
            description={
              search
                ? `No hay clientes que coincidan con "${search}"${
                    period ? ` creados ${period}` : ""
                  }.`
                : `No hay clientes creados ${period}.`
            }
            action={
              <Button variant="outline" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="Sin clientes"
            description="Agrega tu primer cliente para empezar."
            action={
              <Button onClick={openCreate}>
                <Plus className="size-4" />
                Nuevo cliente
              </Button>
            }
          />
        )
      ) : (
        <div
          aria-busy={listLoading}
          className={cn(
            "rounded-xl border border-border transition-opacity",
            listLoading && "opacity-60",
          )}
        >
          <Table>
            <TableHeader>
              {/* Las columnas caen por breakpoint en vez de sobrevivir tras un scroll
                  horizontal: a 375px quedan ~327px útiles y nombre + teléfono +
                  comportamiento ya suman más, así que el scroll dejaba «Nombre |
                  Teléfono» en pantalla y empujaba fuera la calificación. Se quedan
                  siempre las dos que contestan por qué se abre esta tabla: quién es y
                  cómo se comporta. */}
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                <TableHead className="hidden w-32 md:table-cell">Creado</TableHead>
                {/* Comportamiento DEL cliente (1-5), del evaluador de conversaciones. El
                    encabezado nombra la dirección: un "Rating" pelado se lee como la
                    calificación que el cliente nos dio. */}
                <TableHead className="w-32">Comportamiento</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow
                  key={c.id}
                  // El `onClick` se queda como comodidad de ratón; el teclado entra
                  // por el botón de la celda del nombre, no por la fila.
                  className="cursor-pointer hover:bg-surface"
                  onClick={() => openCustomer(c.id)}
                >
                  <TableCell className="font-medium">
                    <RowOpenButton
                      label={`Ver datos de ${c.name}`}
                      onOpen={() => openCustomer(c.id)}
                    >
                      {c.name}
                    </RowOpenButton>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {c.phone}
                  </TableCell>
                  <TableCell
                    className="hidden text-xs text-muted-foreground tabular-nums md:table-cell"
                    title={formatDateTime(c.created_at)}
                  >
                    {listDate(c.created_at)}
                  </TableCell>
                  <TableCell>
                    {/* `compact`: la columna es estrecha y la cola «· 3 conversaciones»
                        la ensanchaba hasta empujar el resto fuera del teléfono. El dato
                        sigue en el `title` del propio componente. */}
                    <CustomerRating avg={c.rating_avg} count={c.rating_count} compact />
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ListFooter
        shown={customers.length}
        total={count}
        loading={listLoading}
        onLoadMore={() =>
          loadCustomers({ query: listQuery, offset: customers.length, append: true })
        }
      />

      {/* Create dialog (editing happens in the drawer) */}
      <Dialog open={creating} onOpenChange={(open) => !open && closeCreate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
            <DialogDescription>Agrega un cliente a tu negocio.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-name">Nombre</Label>
              <CharCountInput
                id="cust-name"
                max={120}
                value={form.name}
                onChange={(name) => setForm((prev) => ({ ...prev, name }))}
                placeholder="Ej. Ana Fuentes"
                aria-invalid={formErrors.name ? true : undefined}
                describedBy={formErrors.name ? "cust-name-error" : undefined}
              />
              {formErrors.name && (
                <p
                  id="cust-name-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {formErrors.name}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-phone">Teléfono</Label>
              <Input
                id="cust-phone"
                value={form.phone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+56912345678"
                aria-invalid={formErrors.phone ? true : undefined}
                aria-describedby={formErrors.phone ? "cust-phone-error" : undefined}
              />
              {formErrors.phone && (
                <p
                  id="cust-phone-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {formErrors.phone}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-email">Email (opcional)</Label>
              <Input
                id="cust-email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="cliente@correo.com"
                aria-invalid={formErrors.email ? true : undefined}
                aria-describedby={formErrors.email ? "cust-email-error" : undefined}
              />
              {formErrors.email && (
                <p
                  id="cust-email-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {formErrors.email}
                </p>
              )}
            </div>
            {formErrors._form && (
              <p role="alert" className="text-sm text-destructive">
                {formErrors._form}
              </p>
            )}
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Guardando…" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerDrawer
        customerId={openCustomerId}
        onOpenChange={(open) => {
          if (!open) closeCustomer();
        }}
        onCustomerSaved={handleCustomerSaved}
      />
    </div>
  );
}

// `useSearchParams` requires a Suspense boundary in the App Router.
export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersPageContent />
    </Suspense>
  );
}
