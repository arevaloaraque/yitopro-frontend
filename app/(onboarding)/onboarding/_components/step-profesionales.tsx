"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnboarding } from "@/lib/onboarding";
import type { Professional } from "@/lib/types";

/**
 * Step "Profesionales" — editable list of staff members (name only).
 *
 * - Add via `addProfessional(name)` (persists, then clears the input).
 * - Inline edit via `updateProfessional(id, { name })` (persists on blur/Enter).
 * - Remove via `removeProfessional(id)`.
 * Validation (≥1 with a non-empty name) lives in the page.
 */

interface EditableProfessionalRowProps {
  pro: Professional;
  onUpdate: (id: string, patch: { name?: string }) => Promise<void>;
  onRemove: (id: string) => void;
}

function EditableProfessionalRow({
  pro,
  onUpdate,
  onRemove,
}: EditableProfessionalRowProps) {
  const [draftName, setDraftName] = useState(pro.name);

  function commitName() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== pro.name) {
      void onUpdate(pro.id, { name: trimmed });
    } else {
      setDraftName(pro.name);
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border/40 p-3">
      <Input
        aria-label="Nombre del profesional"
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        placeholder="Nombre del profesional"
        className="flex-1"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(pro.id)}
        aria-label="Eliminar profesional"
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

export function StepProfesionales() {
  const { data, addProfessional, updateProfessional, removeProfessional } =
    useOnboarding();

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!name.trim()) {
      setError("Ingresa el nombre del profesional.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addProfessional(name.trim());
      setName("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo agregar el profesional.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {data.professionals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no tienes profesionales. Agrega el primero abajo.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.professionals.map((pro) => (
            <EditableProfessionalRow
              key={pro.id}
              pro={pro}
              onUpdate={updateProfessional}
              onRemove={removeProfessional}
            />
          ))}
        </ul>
      )}

      {/* Add form */}
      <div className="space-y-2 rounded-xl border border-dashed border-border/60 p-3">
        <Label className="text-xs" htmlFor="new-professional-name">
          Nuevo profesional
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="new-professional-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAdd();
              }
            }}
            placeholder="Ej: María Pérez"
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Agregar profesional
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-[0.8rem] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
