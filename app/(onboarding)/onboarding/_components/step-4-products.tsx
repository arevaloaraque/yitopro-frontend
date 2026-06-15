"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useOnboarding } from "@/lib/onboarding";

export function Step4Products() {
  const { data, updateProduct, removeProduct, addProduct } = useOnboarding();

  if (data.products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Selecciona una industria en el paso 2 para generar productos automáticamente,
          o agrega productos manualmente.
        </p>
        <Button variant="outline" size="sm" onClick={addProduct}>
          <Plus className="size-3.5" />
          Agregar producto
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.products.map((prd) => (
        <div
          key={prd.id}
          className="flex items-start gap-3 rounded-xl border border-border/40 p-3"
        >
          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={prd.name}
                onChange={(e) =>
                  updateProduct(prd.id, { name: e.target.value })
                }
                placeholder="Nombre del producto"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Precio</Label>
                <Input
                  type="number"
                  min={0}
                  value={prd.price}
                  onChange={(e) =>
                    updateProduct(prd.id, { price: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Stock</Label>
                <Input
                  type="number"
                  min={0}
                  value={prd.stock}
                  onChange={(e) =>
                    updateProduct(prd.id, { stock: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={prd.sellable_via_whatsapp}
                onChange={(checked) =>
                  updateProduct(prd.id, { sellable_via_whatsapp: checked })
                }
              />
              <Label className="text-xs">Vendible por WhatsApp</Label>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => removeProduct(prd.id)}
            aria-label="Eliminar producto"
            className="mt-6 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={addProduct}
        className="w-full"
      >
        <Plus className="size-3.5" />
        Agregar producto
      </Button>
    </div>
  );
}
