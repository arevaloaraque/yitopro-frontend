"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Receipt, Search, ShoppingBag } from "lucide-react";
import type { Product } from "@/lib/types";
import {
  searchProducts,
  createProduct,
  updateProduct,
  listOrders,
  type Order,
  type OrderStatus,
} from "@/lib/api";
import { Loading, EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  price: string;
  stock: string;
  sellable_via_whatsapp: boolean;
}

const emptyForm: FormData = { name: "", price: "", stock: "0", sellable_via_whatsapp: true };

function formatPrice(price: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(price);
}

function productToForm(p: Product): FormData {
  return {
    name: p.name,
    price: String(p.price),
    stock: String(p.stock),
    sellable_via_whatsapp: p.sellable_via_whatsapp,
  };
}

const statusLabels: Record<OrderStatus, string> = {
  draft: "Borrador",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
};

const statusVariants: Record<OrderStatus, "warning" | "success" | "secondary"> = {
  draft: "warning",
  confirmed: "success",
  cancelled: "secondary",
};

function orderItemsLabel(items: Order["items"]): string {
  return items.map((i) => `${i.product_name} ×${i.quantity}`).join(", ");
}

const PAGE_SIZE = 20;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Lista de productos: búsqueda + paginación server-side ("cargar más").
  const loadProducts = useCallback(
    async (opts: { search: string; offset: number; append: boolean }) => {
      setListLoading(true);
      setError(null);
      try {
        const res = await searchProducts({
          search: opts.search || undefined,
          limit: PAGE_SIZE,
          offset: opts.offset,
        });
        setProducts((prev) =>
          opts.append ? [...prev, ...res.items] : res.items,
        );
        setCount(res.count);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar productos");
      } finally {
        setLoading(false);
        setListLoading(false);
      }
    },
    [],
  );

  // Debounce de la búsqueda (vuelve a la primera página en cada cambio).
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => loadProducts({ search, offset: 0, append: false }),
      250,
    );
    return () => clearTimeout(searchTimer.current);
  }, [search, loadProducts]);

  function refetch() {
    setLoading(true);
    loadProducts({ search, offset: 0, append: false });
  }

  // Pedidos (los crea el agente de ventas o el panel). Secundarios: un fallo
  // no bloquea la página de productos.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await listOrders();
        if (!cancelled) setOrders(data);
      } catch {
        /* noop */
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function validate(f: FormData): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Requerido";
    if (!f.price.trim() || isNaN(Number(f.price)) || Number(f.price) < 0) {
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
          price: Number(form.price),
          stock: Number(form.stock),
          sellable_via_whatsapp: form.sellable_via_whatsapp,
        });
        setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        closeDialog();
      } else {
        await createProduct({
          name: form.name.trim(),
          price: Number(form.price),
          stock: Number(form.stock),
          sellable_via_whatsapp: form.sellable_via_whatsapp,
          is_active: true,
        });
        closeDialog();
        loadProducts({ search, offset: 0, append: false });
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
      prev.map((p) =>
        p.id === product.id ? { ...p, is_active: !p.is_active } : p,
      ),
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

  if (loading) return <Loading rows={4} label="Cargando productos…" />;

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Productos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Catálogo de productos de tu negocio.</p>
        </div>
        <ErrorState description={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Productos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Catálogo de productos de tu negocio.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Nuevo producto
        </Button>
      </div>

      {actionError && (
        <p className="text-sm text-destructive">{actionError}</p>
      )}

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Productos</TabsTrigger>
          <TabsTrigger value="orders">Pedidos / Borradores</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4 space-y-4">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="pl-8"
            />
          </div>

          {products.length === 0 ? (
            search ? (
              <EmptyState
                icon={Search}
                title="Sin resultados"
                description={`No hay productos que coincidan con "${search}".`}
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
            <div className="rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="w-28 text-right">Precio</TableHead>
                    <TableHead className="w-20 text-right">Stock</TableHead>
                    <TableHead className="w-28">WhatsApp</TableHead>
                    <TableHead className="w-24">Estado</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(p.price)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={p.stock === 0 ? "text-destructive" : ""}>{p.stock}</span>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={p.sellable_via_whatsapp}
                          onChange={() => toggleWhatsApp(p)}
                          aria-label={p.sellable_via_whatsapp ? "Desactivar venta por WhatsApp" : "Activar venta por WhatsApp"}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={p.is_active}
                            onChange={() => toggleActive(p)}
                            aria-label={p.is_active ? "Desactivar producto" : "Activar producto"}
                          />
                          <Badge variant={p.is_active ? "success" : "secondary"} className="text-xs tabular-nums">
                            {p.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => openEdit(p)}
                          aria-label="Editar producto"
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

          {products.length > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Mostrando {products.length} de {count}
              </span>
              {products.length < count && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={listLoading}
                  onClick={() =>
                    loadProducts({
                      search,
                      offset: products.length,
                      append: true,
                    })
                  }
                >
                  {listLoading ? "Cargando…" : "Cargar más"}
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          {ordersLoading ? (
            <Loading rows={3} label="Cargando pedidos…" />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Sin pedidos"
              description="Los pedidos creados por el asistente o el panel aparecerán aquí."
            />
          ) : (
            <div className="rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Ítems</TableHead>
                    <TableHead className="w-32 text-right">Total</TableHead>
                    <TableHead className="w-28">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.customer}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {orderItemsLabel(order.items)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(order.total)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[order.status]}>
                          {statusLabels[order.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

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
              <Input
                id="prod-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ej. Shampoo hipoalergénico"
              />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prod-price">Precio</Label>
                <Input
                  id="prod-price"
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                  placeholder="8990"
                />
                {formErrors.price && <p className="text-xs text-destructive">{formErrors.price}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prod-stock">Stock</Label>
                <Input
                  id="prod-stock"
                  type="number"
                  min={0}
                  value={form.stock}
                  onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
                  placeholder="10"
                />
                {formErrors.stock && <p className="text-xs text-destructive">{formErrors.stock}</p>}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <Label htmlFor="prod-whatsapp" className="cursor-pointer text-sm">
                Venta por WhatsApp
              </Label>
              <Switch
                id="prod-whatsapp"
                checked={form.sellable_via_whatsapp}
                onChange={(v) => setForm((prev) => ({ ...prev, sellable_via_whatsapp: v }))}
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
