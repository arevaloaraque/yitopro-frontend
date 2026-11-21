"use client";

import { Check, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Per-section save action: one button saves exactly the section it lives in.
 *
 * Pie de card con separador superior: el estado (Guardado / error) va a la
 * IZQUIERDA, donde se lee antes que la acción, y el botón al borde derecho,
 * donde termina el ojo tras un grid de dos columnas. El `min-h-5` del estado
 * evita que la fila salte al aparecer «Guardado», y `role="status"` hace que
 * ese resultado se ANUNCIE a lectores de pantalla (WCAG 4.1.3): sin él,
 * pulsar «Guardar» era silencio.
 *
 * Compartido (settings + horario por profesional): antes vivía como función
 * local de la página y el pie del componente de horarios lo re-implementaba
 * con drift visible (text-xs, sin iconos, botón sólido) en la misma pantalla.
 */
export function SaveBar({
  label,
  onSave,
  saving,
  saved,
  error,
  disabled = false,
  className,
}: {
  label: string;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  error: string | null;
  /** Nothing changed since it was loaded — don't offer a pointless write. */
  disabled?: boolean;
  /** Colocación en el grid de la card (p. ej. `xl:col-span-2`). */
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-clay-line/40 pt-4",
        className,
      )}
    >
      <div role="status" className="flex min-h-5 items-center gap-3">
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" />
            Guardado
          </span>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <Button variant="outline" onClick={onSave} disabled={saving || disabled}>
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        {label}
      </Button>
    </div>
  );
}
