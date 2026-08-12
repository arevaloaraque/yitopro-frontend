"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createOrder,
  updateOrder,
  searchProducts,
  type Order,
  type OrderItemInput,
} from "@/lib/api";
import type { Product } from "@/lib/types";
import { useMoney } from "@/lib/business";
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

interface OrderEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` → create a new order; an order → edit its items (customer fixed). */
  order: Order | null;
  onSaved: (order: Order) => void;
}

interface Row {
  product_id: string;
  quantity: string;
}

const emptyRow: Row = { product_id: "", quantity: "1" };

type ProductOption = { value: string; label: string };

export function OrderEditorDialog({
  open,
  onOpenChange,
  order,
  onSaved,
}: OrderEditorDialogProps) {
  const editing = order !== null;

  // The parent remounts this dialog per open (via `key`), so `useState`
  // initializers seed a fresh form each time — no reset effect needed.
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [rows, setRows] = useState<Row[]>(() =>
    order && order.items.length > 0
      ? order.items.map((i) => ({
          product_id: i.product_id,
          quantity: String(i.quantity),
        }))
      : [{ ...emptyRow }],
  );
  const [products, setProducts] = useState<Product[]>([]);
  const money = useMoney();
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Subtotal de una fila, o `null` si todavía no hay producto elegido (se muestra «—»). */
  function rowSubtotal(row: Row): number | null {
    const product = products.find((p) => p.id === row.product_id);
    if (!product) return null;
    const qty = Number(row.quantity);
    return Number.isFinite(qty) && qty > 0 ? product.price * qty : 0;
  }

  const total = rows.reduce((sum, row) => sum + (rowSubtotal(row) ?? 0), 0);
  const [saving, setSaving] = useState(false);

  // Load the sellable catalogue when the dialog opens (async setState only).
  // First 100 active products, filtered to WhatsApp-sellable (what
  // the backend accepts on an order). Swap for a ProductCombobox if a tenant
  // ever has >100 sellable products.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    searchProducts({ active: true, limit: 100 })
      .then((res) => {
        if (!cancelled) setProducts(res.items.filter((p) => p.sellable_via_whatsapp));
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Options include any product already on the order, so an existing line still
  // shows its name even if the product is now inactive or past the first 100.
  const options: ProductOption[] = (() => {
    const byId = new Map<string, string>();
    if (order) for (const i of order.items) byId.set(i.product_id, i.product_name);
    for (const p of products) {
      byId.set(p.id, `${p.name} · ${money(p.price)}`);
    }
    return [...byId].map(([value, label]) => ({ value, label }));
  })();

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setErrors((prev) => (prev._items ? { ...prev, _items: "" } : prev));
  }

  function buildItems(): OrderItemInput[] {
    return rows
      .filter((r) => r.product_id)
      .map((r) => ({ product_id: r.product_id, quantity: Number(r.quantity) }));
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!editing && !customer) e.customer = "Requerido";
    const items = buildItems();
    if (items.length === 0) e._items = "Agrega al menos un producto.";
    else if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1))
      e._items = "Las cantidades deben ser mayores a 0.";
    return e;
  }

  async function handleSave() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    try {
      const items = buildItems();
      const saved = editing
        ? await updateOrder(order.id, items)
        : await createOrder({ customer_id: customer!.id, items });
      toast.success(editing ? "Pedido actualizado" : "Pedido creado");
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setErrors({
        _form: err instanceof Error ? err.message : "Error al guardar el pedido.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Ancho: el editor tiene una tabla de ítems (producto + cantidad + subtotal + quitar) y
          el `sm:max-w-sm` (384px) del primitivo no alcanza — el nombre del producto se comía la
          fila.
          Alto: `max-h-[85vh]` para que un pedido de 8 ítems no crezca más que la pantalla, y
          `grid-rows-[auto_minmax(0,1fr)_auto]` para que scrollee SOLO el formulario del medio.
          Poner el `overflow-y-auto` en el diálogo entero (primer intento) dejaba el botón
          «Guardar» fuera de la vista al scrollear: el operador tenía que buscarlo. */}
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar pedido" : "Nuevo pedido"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Modifica los productos del borrador."
              : "Crea un pedido manual para un cliente."}
          </DialogDescription>
        </DialogHeader>
        {/* La región que scrollea. `min-h-0` es lo que permite que una fila de grid se
            encoja por debajo de su contenido; sin él el `1fr` no acota nada. */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-customer">Cliente</Label>
            {editing ? (
              <Input id="order-customer" value={order.customer} disabled readOnly />
            ) : (
              <>
                <CustomerCombobox
                  id="order-customer"
                  value={customer}
                  onChange={(c) => {
                    setCustomer(c);
                    setErrors((prev) =>
                      prev.customer ? { ...prev, customer: "" } : prev,
                    );
                  }}
                  aria-invalid={errors.customer ? true : undefined}
                  aria-describedby={
                    errors.customer ? "order-customer-error" : undefined
                  }
                />
                {errors.customer && (
                  <p
                    id="order-customer-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {errors.customer}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Productos</Label>
            {/* Encabezado de columnas: con el subtotal a la derecha, la fila deja de ser
                «un select y dos cosas» y se lee como una tabla. */}
            <div className="hidden items-center gap-2 px-0.5 text-[0.7rem] text-muted-foreground sm:flex">
              <span className="flex-1">Producto</span>
              <span className="w-20 text-center">Cantidad</span>
              <span className="w-28 text-right">Subtotal</span>
              <span className="w-6" aria-hidden />
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                {/* `min-w-0` es la otra mitad del arreglo del desborde: deja que este item
                    baje del min-content de su contenido (ver SelectValue). */}
                <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                  <Select
                    items={options}
                    value={row.product_id}
                    onValueChange={(v) => updateRow(idx, { product_id: v ?? "" })}
                  >
                    {/* `min-w-0` también en el trigger: tiene `whitespace-nowrap`, así que su
                        propio min-content es el texto completo de la opción y ese mínimo
                        empujaba la columna del grid del diálogo a 392px dentro de 343 en
                        móvil. Con esto el texto se recorta (line-clamp-1) en vez de estirar
                        la caja. */}
                    <SelectTrigger className="w-full min-w-0">
                      {/* El trigger muestra solo el NOMBRE; el precio vive en las opciones
                          del desplegable (donde hay espacio y sirve para elegir) y en la
                          columna Subtotal. Con «nombre · precio» en el trigger el texto no
                          cabía y se cortaba a mitad del número («$17.00(»), que se lee como
                          un dato corrupto — y la elipsis no es opción acá: el trigger le
                          aplica `line-clamp-1` al valor, o sea `display:-webkit-box`, donde
                          `text-overflow` no tiene efecto. */}
                      <SelectValue placeholder="Seleccionar producto">
                        {(value) =>
                          products.find((p) => p.id === value)?.name ??
                          "Seleccionar producto"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(ev) => updateRow(idx, { quantity: ev.target.value })}
                  aria-label="Cantidad"
                  className="w-20 tabular-nums"
                />
                <span className="w-28 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                  {rowSubtotal(row) === null ? "—" : money(rowSubtotal(row) as number)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={rows.length === 1}
                  aria-label="Quitar producto"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setRows((prev) => [...prev, { ...emptyRow }])}
            >
              <Plus className="size-4" />
              Agregar producto
            </Button>
            {errors._items && (
              <p role="alert" className="text-xs text-destructive">
                {errors._items}
              </p>
            )}
            {/* Total: el operador está armando un pedido con plata; no verla mientras lo
                construye es la parte incómoda de este formulario, no solo el ancho. */}
            <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-2">
              <span className="text-sm font-medium">Total</span>
              <span className="text-sm font-semibold tabular-nums">{money(total)}</span>
            </div>
          </div>

          {errors._form && (
            <p role="alert" className="text-sm text-destructive">
              {errors._form}
            </p>
          )}
        </div>
        <DialogFooter showCloseButton>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando…" : editing ? "Guardar" : "Crear pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
