"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useOnboarding } from "@/lib/onboarding";
import type { RecordFieldType } from "@/lib/types";

const FIELD_TYPES: { value: RecordFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "select", label: "Selector" },
  { value: "date", label: "Fecha" },
  { value: "boolean", label: "Sí/No" },
];

export function Step5Records() {
  const { data, updateRecordField, removeRecordField, addRecordField } =
    useOnboarding();

  if (data.recordFields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Selecciona una industria en el paso 2 para generar campos automáticamente,
          o agrega campos manualmente.
        </p>
        <Button variant="outline" size="sm" onClick={addRecordField}>
          <Plus className="size-3.5" />
          Agregar campo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.recordFields.map((field, idx) => (
        <div
          key={field._key}
          className="rounded-xl border border-border/40 p-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Label (visible al cliente)</Label>
              <Input
                value={field.label}
                onChange={(e) =>
                  updateRecordField(idx, { label: e.target.value })
                }
                placeholder="Ej: Nombre de la mascota"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre interno</Label>
              <Input
                value={field.name}
                onChange={(e) =>
                  updateRecordField(idx, { name: e.target.value })
                }
                placeholder="Ej: pet_name"
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={field.type}
                onValueChange={(v) =>
                  updateRecordField(idx, { type: v as RecordFieldType })
                }
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-4 pb-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.required}
                  onChange={(checked) =>
                    updateRecordField(idx, { required: checked })
                  }
                />
                <Label className="text-xs">Obligatorio</Label>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => removeRecordField(idx)}
                aria-label="Eliminar campo"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>

          {field.type === "select" && (
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs">
                Opciones (separadas por coma)
              </Label>
              <Input
                value={field.options?.join(", ") ?? ""}
                onChange={(e) =>
                  updateRecordField(idx, {
                    options: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="perro, gato, conejo"
              />
            </div>
          )}

          <div className="mt-3 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={field.ai_visible}
                onChange={(checked) =>
                  updateRecordField(idx, { ai_visible: checked })
                }
              />
              <Label className="text-xs">IA puede leer</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={field.ai_editable}
                onChange={(checked) =>
                  updateRecordField(idx, { ai_editable: checked })
                }
              />
              <Label className="text-xs">IA puede editar</Label>
            </div>
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={addRecordField}
        className="w-full"
      >
        <Plus className="size-3.5" />
        Agregar campo
      </Button>
    </div>
  );
}
