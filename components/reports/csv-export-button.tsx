"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportValueCsv, type ReportWindow } from "@/lib/api/reports";

/**
 * Descarga el CSV de cobros de la ventana visible. El texto lo pide
 * `exportValueCsv` a la capa de API — aquí no hay red, solo el Blob y el clic.
 *
 * El prop se llama `range` y no `window`: dentro del componente sombreaba el
 * global del navegador, en el mismo archivo que usa `URL` y `document`.
 */
export function CsvExportButton({ range }: { range: ReportWindow }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const csv = await exportValueCsv(range);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Mismo nombre que el Content-Disposition del backend.
      a.download = `reporte-${range.date_from}-a-${range.date_to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo exportar el CSV.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // `size="lg"` (h-9) porque comparte fila con el selector de período y los
    // campos de fecha, que miden 36 px: con `sm` (28 px) el botón quedaba 8 px
    // más bajo que ellos —medido— y se leía descolgado. `h-11` en móvil por el
    // mínimo táctil de 44 px, que 28 no alcanzaba ni de lejos.
    <Button
      variant="outline"
      size="lg"
      className="h-11 sm:h-9"
      onClick={handleClick}
      disabled={busy}
    >
      <Download className="size-4" />
      {busy ? "Exportando…" : "Exportar cobros"}
    </Button>
  );
}
