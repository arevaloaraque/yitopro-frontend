"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Search, ShoppingBag } from "lucide-react";
import type { Product, ProductCategory, SSEEvent } from "@/lib/types";
import {
  searchProducts,
  createProduct,
  updateProduct,
  listProductCategories,
} from "@/lib/api";
import { subscribeToEvents } from "@/lib/sse";
import { useMoney } from "@/lib/business";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { Loading, EmptyState, ErrorState } from "@/components/states";
import { FilterBar } from "@/components/filters/filter-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CharCountInput } from "@/components/ui/char-count-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListFooter } from "@/components/ui/list-footer";
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
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FormData {
  name: string;
  description: string;
  price: string;
  stock: string;
  sellable_via_whatsapp: boolean;
}

const emptyForm: FormData = {
  name: "",
  description: "",
  price: "",
  stock: "0",
  sellable_via_whatsapp: true,
};

function productToForm(p: Product): FormData {
  return {
    name: p.name,
    description: p.description ?? "",
    price: String(p.price),
    stock: String(p.stock),
    sellable_via_whatsapp: p.sellable_via_whatsapp,
  };
}

const PAGE_SIZE = 20;

/** El filtro de estado vive en la URL, y ahí solo hay strings. */
const ACTIVE_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "true", label: "Activos" },
  { value: "false", label: "Inactivos" },
];

/**
 * Umbrales PRESET y no un número libre.
 *
 * «¿Qué se me está acabando?» se pregunta con dos o tres cifras de costumbre, y
 * un campo abierto costaría validar el vacío, el negativo, el decimal y el
 * "abc" —cuatro maneras de mandar basura al servidor— para responder la misma
 * pregunta con un clic más. El tope es INCLUSIVO: `stock_lte=0` son los
 * agotados, no «menos de 0», que no existe.
 */
const STOCK_OPTIONS = [
  { value: "all", label: "Cualquier stock" },
  { value: "0", label: "Agotados (0)" },
  { value: "5", label: "5 o menos" },
  { value: "10", label: "10 o menos" },
];

/** Los cuatro filtros que se ENVÍAN, y contra los que se decide si una respuesta llegó tarde. */
interface AppliedFilters {
  search: string;
  active: string;
  category: string;
  stock: string;
}

function ProductsPageContent() {
  const money = useMoney();
  const [products, setProducts] = useState<Product[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  // Filtros en la URL: una vista filtrada se comparte y sobrevive un reload.
  // Las claves son las del backend (`category_id`, `stock_lte`) para que la URL
  // del panel y la de la API se lean igual y no haya que traducir al depurar.
  const [filters, setFilters] = useUrlFilters({
    q: "",
    active: "all",
    category_id: "all",
    stock_lte: "all",
  });
  const activeFilter = filters.active;
  const categoryFilter = filters.category_id;
  const stockFilter = filters.stock_lte;
  // El input es el valor crudo; a la red y a la URL va el retrasado, o se haría
  // una request (y un `replaceState`) por pulsación.
  const [search, setSearch] = useState(filters.q);
  const debouncedSearch = useDebounced(search);

  // Las categorías se piden una sola vez: son unas pocas por negocio y no
  // cambian mientras se mira la tabla.
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  // Un solo objeto con los cuatro filtros: cambia de identidad solo cuando cambia
  // uno de ellos, así que sirve de dependencia del efecto de carga y evita
  // repetir el cuádruple en cada sitio que pide la lista (donde olvidarse de uno
  // pasa desapercibido: la request sale, solo sale sin ese filtro).
  const applied: AppliedFilters = useMemo(
    () => ({
      search: debouncedSearch,
      active: activeFilter,
      category: categoryFilter,
      stock: stockFilter,
    }),
    [debouncedSearch, activeFilter, categoryFilter, stockFilter],
  );

  // Filtros vigentes + filas en pantalla, leídos por el handler SSE (que se
  // registra una sola vez) y por la guarda de respuestas obsoletas. Se sincroniza
  // en un efecto —no durante el render— para mantener el render puro.
  const filtersRef = useRef<AppliedFilters>(applied);
  const shownRef = useRef(0);
  useEffect(() => {
    filtersRef.current = applied;
    shownRef.current = products.length;
  });

  /**
   * La respuesta llegó tarde: el operador ya cambió el filtro.
   *
   * Sin esto, teclear «sha» y borrarlo deja en pantalla lo que contestó la
   * request de «sha» si esa llega después que la de "" — la tabla contradice al
   * buscador y el único arreglo aparente es recargar.
   */
  const isStale = useCallback(
    (opts: AppliedFilters) =>
      opts.search !== filtersRef.current.search ||
      opts.active !== filtersRef.current.active ||
      // Categoría y stock entran en la guarda igual que los otros dos: si no, la
      // respuesta de «Agotados» aterrizaba sobre la vista sin filtro y la tabla
      // contradecía al control.
      opts.category !== filtersRef.current.category ||
      opts.stock !== filtersRef.current.stock,
    [],
  );

  // Product list: search + active/category/stock filters + server-side
  // pagination ("load more").
  const loadProducts = useCallback(
    async (
      opts: AppliedFilters & { offset: number; append: boolean; limit?: number },
    ) => {
      setListLoading(true);
      setError(null);
      try {
        const res = await searchProducts({
          search: opts.search || undefined,
          active: opts.active === "all" ? undefined : opts.active === "true",
          category_id: opts.category === "all" ? undefined : opts.category,
          // `|| undefined` sería un bug aquí: "0" es un valor legítimo (los
          // agotados) y solo "all" significa «sin filtro».
          stock_lte: opts.stock === "all" ? undefined : opts.stock,
          limit: opts.limit ?? PAGE_SIZE,
          offset: opts.offset,
        });
        if (isStale(opts)) return;
        setProducts((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setCount(res.count);
      } catch (e) {
        if (isStale(opts)) return;
        setError(e instanceof Error ? e.message : "Error al cargar productos");
      } finally {
        // También guardado: si una respuesta vieja apagara el indicador, la
        // tabla se vería lista mientras la request vigente sigue en vuelo.
        if (!isStale(opts)) {
          setLoading(false);
          setListLoading(false);
        }
      }
    },
    [isStale],
  );

  // El término retrasado es el que se publica en la URL.
  useEffect(() => {
    setFilters({ q: debouncedSearch });
  }, [debouncedSearch, setFilters]);

  // Categorías del catálogo. Sin ellas no se puede pintar el filtro: el `<Select>`
  // necesita el mapa id→nombre o el disparador mostraría el id crudo.
  useEffect(() => {
    let alive = true;
    listProductCategories()
      .then((cats) => {
        if (alive) setCategories(cats);
      })
      // Un fallo aquí no derriba la pantalla: la tabla de productos es lo que se
      // vino a ver, y sin categorías simplemente no aparece ese filtro.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Cualquier cambio de filtro vuelve a la primera página. El `setTimeout(…, 0)`
  // es el idioma que ya usa /payments: llamar directo dejaría un setState
  // síncrono dentro del efecto (cascada de renders), y de paso coalesce dos
  // cambios de filtro que caen en el mismo tick en una sola request.
  useEffect(() => {
    const t = setTimeout(
      () => loadProducts({ ...applied, offset: 0, append: false }),
      0,
    );
    return () => clearTimeout(t);
  }, [applied, loadProducts]);

  function refetch() {
    setLoading(true);
    loadProducts({ ...applied, offset: 0, append: false });
  }

  /**
   * Recarga las filas YA visibles, no la primera página.
   *
   * Con `limit: PAGE_SIZE` a secas, quien había pulsado «Cargar más» tres veces
   * veía la lista encogerse de 80 a 20 filas por confirmar un pedido en otra
   * pestaña, o por crear un producto.
   */
  const reloadShown = useCallback(() => {
    loadProducts({
      ...filtersRef.current,
      offset: 0,
      append: false,
      limit: Math.max(shownRef.current, PAGE_SIZE),
    });
  }, [loadProducts]);

  // Real-time: confirming an order (`pedido_creado`) decrements stock, so refresh
  // the products list to reflect it. Orders themselves live on the Pedidos page.
  // The SSE stream is multiplexed; NotificationsProvider owns the toasts, this
  // screen owns its own data refresh (same pattern as appointments/conversations).
  useEffect(() => {
    const unsub = subscribeToEvents((event: SSEEvent) => {
      if (event.type === "pedido_creado") reloadShown();
    });
    return unsub;
  }, [reloadShown]);

  function validate(f: FormData): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Requerido";
    else if (f.name.trim().length > 255) errs.name = "Máximo 255 caracteres";
    const price = f.price.trim();
    if (
      !price ||
      isNaN(Number(price)) ||
      Number(price) < 0 ||
      !/^\d+(\.\d{1,2})?$/.test(price)
    ) {
      errs.price = "Precio inválido";
    }
    if (!f.stock.trim() || isNaN(Number(f.stock)) || Number(f.stock) < 0) {
      errs.stock = "Stock inválido";
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
        const updated = await updateProduct(editing.id, {
          name: form.name.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          stock: Number(form.stock),
          sellable_via_whatsapp: form.sellable_via_whatsapp,
        });
        setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        closeDialog();
      } else {
        await createProduct({
          name: form.name.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          stock: Number(form.stock),
          sellable_via_whatsapp: form.sellable_via_whatsapp,
          is_active: true,
        });
        closeDialog();
        reloadShown();
      }
    } catch (e) {
      setFormErrors({ _form: e instanceof Error ? e.message : "Error al guardar" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    setActionError(null);
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, is_active: !p.is_active } : p)),
    );
    try {
      await updateProduct(product.id, { is_active: !product.is_active });
    } catch {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, is_active: product.is_active } : p,
        ),
      );
      setActionError("No se pudo cambiar el estado del producto.");
    }
  }

  async function toggleWhatsApp(product: Product) {
    setActionError(null);
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? { ...p, sellable_via_whatsapp: !p.sellable_via_whatsapp }
          : p,
      ),
    );
    try {
      await updateProduct(product.id, {
        sellable_via_whatsapp: !product.sellable_via_whatsapp,
      });
    } catch {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id
            ? { ...p, sellable_via_whatsapp: product.sellable_via_whatsapp }
            : p,
        ),
      );
      setActionError("No se pudo cambiar el estado de WhatsApp.");
    }
  }

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setForm(emptyForm);
    setFormErrors({});
  }

  function openEdit(product: Product) {
    setCreating(false);
    setEditing(product);
    setForm(productToForm(product));
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

  // Se deriva de los filtros que se ENVIARON, no de la lista devuelta: es lo que
  // distingue «todavía no cargaste nada» de «tu filtro no encontró nada», y solo
  // el segundo ofrece limpiar.
  const filterActive =
    debouncedSearch.trim() !== "" ||
    activeFilter !== "all" ||
    categoryFilter !== "all" ||
    stockFilter !== "all";

  function clearFilters() {
    setSearch("");
    setFilters({ active: "all", category_id: "all", stock_lte: "all" });
  }

  // Una sola bandera para el filtro Y la columna: si cada uno tuviera su propia
  // condición, cabecera y celdas podrían discrepar y la tabla se desalinearía.
  const hasCategories = categories.length > 0;

  // Con el mapa id→nombre por delante: sin `items` el disparador pintaría el
  // valor crudo y el filtro se leería «3».
  const categoryOptions = [
    { value: "all", label: "Todas" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Productos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Catálogo de productos de tu negocio.
        </p>
      </div>
      <Button onClick={openCreate}>
        <Plus className="size-4" />
        Nuevo producto
      </Button>
    </div>
  );

  if (loading) return <Loading rows={4} label="Cargando productos…" />;

  // Solo derriba la pantalla si no hay nada que mostrar: si falla un «Cargar
  // más», las filas ya cargadas siguen siendo válidas y el error va en línea.
  if (error && products.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {header}
        <ErrorState description={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {header}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-4">
        <FilterBar active={filterActive} onClear={clearFilters}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prod-active">Estado</Label>
            {/* `items` no es decoración: sin el mapa valor→etiqueta el disparador
                pinta el valor crudo y el filtro se leería «true». */}
            <Select
              items={ACTIVE_OPTIONS}
              value={activeFilter}
              onValueChange={(v) => setFilters({ active: v ?? "all" })}
            >
              <SelectTrigger id="prod-active" className="w-44">
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

          {/* El filtro de categoría solo existe si el negocio tiene categorías:
              un desplegable con una sola opción («Todas») es ruido, y pintarlo
              antes de que llegue la lista mostraría el id de la URL en el
              disparador. */}
          {hasCategories && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-category">Categoría</Label>
              <Select
                items={categoryOptions}
                value={categoryFilter}
                onValueChange={(v) => setFilters({ category_id: v ?? "all" })}
              >
                <SelectTrigger id="prod-category" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prod-stock">Stock</Label>
            <Select
              items={STOCK_OPTIONS}
              value={stockFilter}
              onValueChange={(v) => setFilters({ stock_lte: v ?? "all" })}
            >
              <SelectTrigger id="prod-stock" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-72 flex-1 flex-col gap-1.5">
            <Label htmlFor="prod-search">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="prod-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Shampoo hipoalergénico…"
                className="pl-8"
                aria-describedby="prod-search-hint"
              />
            </div>
            {/* El servidor busca en nombre Y descripción, así que devuelve filas
                cuyo texto no aparece en ninguna columna. Decirlo aquí cuesta una
                línea; mostrar la descripción truncada costaría una segunda línea
                en cada fila y aun así no probaría por qué coincidió (la palabra
                puede caer más allá del corte). */}
            <p id="prod-search-hint" className="text-xs text-muted-foreground">
              Busca en el nombre y en la descripción, así que un resultado puede
              coincidir por texto que no se ve en la tabla.
            </p>
          </div>
        </FilterBar>

        {products.length === 0 ? (
          filterActive ? (
            <EmptyState
              icon={Search}
              title="Sin resultados"
              description="Ningún producto coincide con estos filtros."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ShoppingBag}
              title="Sin productos"
              description="Agrega tu primer producto al catálogo."
              action={
                <Button onClick={openCreate}>
                  <Plus className="size-4" />
                  Nuevo producto
                </Button>
              }
            />
          )
        ) : (
          <>
            {/* Acompañante textual del atenuado: una señal solo por opacidad no
                la percibe quien usa lector de pantalla ni quien mira de reojo. */}
            {listLoading && (
              <p role="status" className="text-xs text-muted-foreground">
                Actualizando la lista…
              </p>
            )}
            <div
              aria-busy={listLoading}
              className={`rounded-xl border border-border transition-opacity ${
                listLoading ? "opacity-60" : ""
              }`}
            >
              <Table>
                <TableHeader>
                  {/* Las columnas CAEN por breakpoint en vez de sobrevivir tras un
                      scroll horizontal: en teléfono el scroll dejaba «Nombre» en
                      pantalla y empujaba fuera precio y estado. Se quedan siempre
                      la que identifica la fila (Nombre), el precio, el estado y la
                      acción; stock y WhatsApp bajan a la ficha de edición, que los
                      dos tiene. */}
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    {/* La categoría se muestra porque el filtro no la responde:
                        con «Todas» puesto, el nombre de un producto rara vez dice
                        a qué familia pertenece («Cepillo doble» no dice
                        Accesorios). Cae en tablet: es contexto, no identidad. */}
                    {hasCategories && (
                      <TableHead className="hidden w-32 md:table-cell">
                        Categoría
                      </TableHead>
                    )}
                    <TableHead className="w-28 text-right">Precio</TableHead>
                    <TableHead className="hidden w-20 text-right sm:table-cell">
                      Stock
                    </TableHead>
                    <TableHead className="hidden w-28 lg:table-cell">
                      WhatsApp
                    </TableHead>
                    <TableHead className="w-28">Estado</TableHead>
                    {/* `w-12` y no `w-20`: es un solo botón de icono, y en 375px
                        los 32px de más empujarían Estado tras el scroll. */}
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      {/* `whitespace-normal` deshace el `nowrap` global de la
                          tabla: sin él un nombre largo fija el ancho mínimo de
                          esta columna y saca Estado de un teléfono. */}
                      <TableCell className="font-medium whitespace-normal">
                        {p.name}
                        <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                          {p.stock === 0 ? "Sin stock" : `Stock: ${p.stock}`}
                        </span>
                      </TableCell>
                      {hasCategories && (
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {p.category_name ?? "Sin categoría"}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">
                        {money(p.price)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        <span className={p.stock === 0 ? "text-destructive" : ""}>
                          {p.stock}
                        </span>
                        {p.stock === 0 && (
                          <Badge variant="destructive" className="ml-1.5 text-xs">
                            Agotado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Switch
                          checked={p.sellable_via_whatsapp}
                          onChange={() => toggleWhatsApp(p)}
                          aria-label={
                            p.sellable_via_whatsapp
                              ? "Desactivar venta por WhatsApp"
                              : "Activar venta por WhatsApp"
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={p.is_active}
                            onChange={() => toggleActive(p)}
                            aria-label={
                              p.is_active ? "Desactivar producto" : "Activar producto"
                            }
                          />
                          <Badge
                            variant={p.is_active ? "success" : "secondary"}
                            className="text-xs tabular-nums"
                          >
                            {p.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => openEdit(p)}
                          aria-label={`Editar ${p.name}`}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <ListFooter
          shown={products.length}
          total={count}
          loading={listLoading}
          onLoadMore={() =>
            loadProducts({ ...applied, offset: products.length, append: true })
          }
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creating ? "Nuevo producto" : "Editar producto"}</DialogTitle>
            <DialogDescription>
              {creating
                ? "Completa los datos del nuevo producto."
                : "Modifica los datos del producto."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-name">Nombre</Label>
              <CharCountInput
                id="prod-name"
                max={255}
                value={form.name}
                onChange={(name) => setForm((prev) => ({ ...prev, name }))}
                placeholder="Ej. Shampoo hipoalergénico"
              />
              {formErrors.name && (
                <p className="text-xs text-destructive">{formErrors.name}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prod-price">Precio</Label>
                <Input
                  id="prod-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, price: e.target.value }))
                  }
                  placeholder="8990"
                />
                {formErrors.price && (
                  <p className="text-xs text-destructive">{formErrors.price}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prod-stock">Stock</Label>
                <Input
                  id="prod-stock"
                  type="number"
                  min={0}
                  value={form.stock}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, stock: e.target.value }))
                  }
                  placeholder="10"
                />
                {formErrors.stock && (
                  <p className="text-xs text-destructive">{formErrors.stock}</p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-description">Descripción (opcional)</Label>
              <Textarea
                id="prod-description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Ej. Shampoo sin sulfatos para pieles sensibles, 500 ml"
                aria-describedby="prod-description-hint"
              />
              {/* No es un campo decorativo: el agente de WhatsApp busca el
                  catálogo por nombre Y descripción, así que un producto sin ella
                  solo aparece si el cliente escribe el nombre casi exacto. */}
              <p id="prod-description-hint" className="text-xs text-muted-foreground">
                El asistente de WhatsApp la lee para recomendar y encontrar este
                producto.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <Label htmlFor="prod-whatsapp" className="cursor-pointer text-sm">
                Venta por WhatsApp
              </Label>
              <Switch
                id="prod-whatsapp"
                checked={form.sellable_via_whatsapp}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, sellable_via_whatsapp: v }))
                }
              />
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

// `useSearchParams` (dentro de `useUrlFilters`) obliga a un Suspense en el App
// Router.
export default function ProductsPage() {
  return (
    <Suspense fallback={<Loading rows={4} label="Cargando productos…" />}>
      <ProductsPageContent />
    </Suspense>
  );
}
