"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnboarding } from "@/lib/onboarding";

export function Step3Services() {
  const { data, updateService, removeService, addService } = useOnboarding();

  if (data.services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Selecciona una industria en el paso anterior para generar servicios automáticamente,
          o agrega servicios manualmente.
        </p>
        <Button variant="outline" size="sm" onClick={addService}>
          <Plus className="size-3.5" />
          Agregar servicio
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.services.map((svc) => (
        <div
          key={svc.id}
          className="flex items-start gap-3 rounded-xl border border-border/40 p-3"
        >
          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={svc.name}
                onChange={(e) => updateService(svc.id, { name: e.target.value })}
                placeholder="Nombre del servicio"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Duración (min)</Label>
                <Input
                  type="number"
                  min={5}
                  value={svc.duration_minutes}
                  onChange={(e) =>
                    updateService(svc.id, {
                      duration_minutes: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Precio</Label>
                <Input
                  type="number"
                  min={0}
                  value={svc.price}
                  onChange={(e) =>
                    updateService(svc.id, { price: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => removeService(svc.id)}
            aria-label="Eliminar servicio"
            className="mt-6 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={addService}
        className="w-full"
      >
        <Plus className="size-3.5" />
        Agregar servicio
      </Button>
    </div>
  );
}
