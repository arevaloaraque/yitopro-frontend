"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnboarding } from "@/lib/onboarding";
import type { Service } from "@/lib/types";

/**
 * Step "Servicios" — persisted services list.
 *
 * Each row edits a real service via `updateService` (persists on blur/Enter).
 * The "add" form creates a service via the async `addService(input)` mutator
 * and clears on success.
 */

interface EditableServiceRowProps {
  svc: Service;
  onUpdate: (
    id: string,
    patch: Partial<Omit<Service, "id" | "business_id">>,
  ) => Promise<void>;
  onRemove: (id: string) => void;
}

function EditableServiceRow({
  svc,
  onUpdate,
  onRemove,
}: EditableServiceRowProps) {
  const [draftName, setDraftName] = useState(svc.name);
  const [draftDuration, setDraftDuration] = useState(
    String(svc.duration_minutes),
  );
  const [draftPrice, setDraftPrice] = useState(String(svc.price));

  function commitName() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== svc.name) {
      void onUpdate(svc.id, { name: trimmed });
    } else {
      setDraftName(svc.name);
    }
  }

  function commitDuration() {
    const parsed = parseInt(draftDuration, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed !== svc.duration_minutes) {
      void onUpdate(svc.id, { duration_minutes: parsed });
    } else {
      setDraftDuration(String(svc.duration_minutes));
    }
  }

  function commitPrice() {
    const parsed = parseFloat(draftPrice);
    if (!isNaN(parsed) && parsed >= 0 && parsed !== svc.price) {
      void onUpdate(svc.id, { price: parsed });
    } else {
      setDraftPrice(String(svc.price));
    }
  }

  return (
    <div
      key={svc.id}
      className="flex items-start gap-3 rounded-xl border border-border/40 p-3"
    >
      <div className="flex-1 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Nombre</Label>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            placeholder="Nombre del servicio"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Duración (min)</Label>
            <Input
              type="number"
              min={5}
              value={draftDuration}
              onChange={(e) => setDraftDuration(e.target.value)}
              onBlur={commitDuration}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Precio</Label>
            <Input
              type="number"
              min={0}
              value={draftPrice}
              onChange={(e) => setDraftPrice(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
            />
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(svc.id)}
        aria-label="Eliminar servicio"
        className="mt-6 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export function Step3Services() {
  const { data, updateService, removeService, addService } = useOnboarding();

  const [name, setName] = useState("");
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!name.trim()) {
      setError("Ingresa un nombre para el servicio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addService({
        name: name.trim(),
        duration_minutes: duration,
        price,
        is_active: true,
      });
      setName("");
      setDuration(30);
      setPrice(0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo agregar el servicio.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {data.services.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no tienes servicios. Agrega el primero abajo.
        </p>
      ) : (
        data.services.map((svc) => (
          <EditableServiceRow
            key={svc.id}
            svc={svc}
            onUpdate={updateService}
            onRemove={removeService}
          />
        ))
      )}

      {/* Add form */}
      <div className="space-y-3 rounded-xl border border-dashed border-border/60 p-3">
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="new-service-name">
            Nuevo servicio
          </Label>
          <Input
            id="new-service-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Corte de pelo"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="new-service-duration">
              Duración (min)
            </Label>
            <Input
              id="new-service-duration"
              type="number"
              min={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="new-service-price">
              Precio
            </Label>
            <Input
              id="new-service-price"
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-[0.8rem] text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={saving}
          className="w-full"
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Agregar servicio
        </Button>
      </div>
    </div>
  );
}
