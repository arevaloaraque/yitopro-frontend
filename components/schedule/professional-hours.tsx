"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { WeekEditor } from "@/components/schedule/week-editor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SaveBar } from "@/components/save-bar";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import {
  getBusinessHours,
  getProfessionalSchedule,
  listProfessionals,
  putProfessionalSchedule,
} from "@/lib/api";
import { subscribeToEvents } from "@/lib/sse";
import {
  buildWindows,
  emptyWeek,
  validateWeek,
  windowsToWeek,
  type DayState,
} from "@/lib/schedule/windows";
import type { Professional } from "@/lib/types";

/**
 * Horario semanal de cada profesional, editable después del alta.
 *
 * El backend expone `GET|PUT /professionals/{id}/schedule/` desde siempre, pero
 * el único consumidor era el paso 5 del asistente de alta: una vez terminado, no
 * quedaba ninguna forma de cambiar el horario de alguien sin que un operador
 * entrara por la API. Esto cierra eso reusando el mismo `WeekEditor` y los mismos
 * helpers de ventanas que usa el wizard, para que las dos pantallas no puedan
 * discrepar sobre qué es una semana válida.
 */
export function ProfessionalHours() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>("");
  const [week, setWeek] = useState<DayState[]>(emptyWeek);
  const [weekState, setWeekState] = useState<"idle" | "loading" | "ready">("idle");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La respuesta de una selección anterior no puede pisar la actual: el operador
  // cambia de profesional más rápido de lo que responde la red.
  const latestRef = useRef<string>("");

  // El horario de la tienda, para el botón de copiar. `null` mientras carga;
  // vacío significa que el negocio no tiene horario configurado, que en el
  // backend es «siempre abierto» — copiarlo dejaría al profesional SIN horario
  // propio, que es justo lo contrario de lo que el botón promete.
  const [businessWeek, setBusinessWeek] = useState<DayState[] | null>(null);
  const [businessHasHours, setBusinessHasHours] = useState(false);
  // Copiar llena la grilla pero NO guarda: sin este aviso, «Copiar» se lee como
  // «aplicado» y el operador se va sin apretar Guardar.
  const [copied, setCopied] = useState(false);

  // `reloadKey` en vez de una función que el efecto invoque: poner el estado en
  // "loading" de forma síncrona dentro del efecto encadena renders, y el estado
  // inicial ya es "loading". Reintentar bumpea la clave.
  const [reloadKey, setReloadKey] = useState(0);
  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    listProfessionals()
      .then((pros) => {
        if (cancelled) return;
        setProfessionals(pros.filter((p) => p.is_active));
        setState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Error al cargar profesionales");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Frescura del listado por SSE: profesional_* llega por fila, y el bulk de la
  // reconciliación de plan viaja como negocio_actualizado. Refresco OPORTUNISTA:
  // solo repone el select — nunca toca la grilla en edición (selectedId/week
  // viven aparte) y un fallo de red aquí no derriba la sección a ErrorState.
  useEffect(
    () =>
      subscribeToEvents((event) => {
        if (
          event.type === "profesional_creado" ||
          event.type === "profesional_actualizado" ||
          event.type === "profesional_eliminado" ||
          event.type === "negocio_actualizado"
        ) {
          listProfessionals()
            .then((pros) => setProfessionals(pros.filter((p) => p.is_active)))
            .catch(() => {});
        }
      }),
    [],
  );

  // Se pide una vez, no en cada clic: el botón tiene que poder deshabilitarse
  // ANTES de que lo toquen si el negocio no tiene horario. Un fallo acá no es
  // fatal — solo deja el botón apagado.
  useEffect(() => {
    let cancelled = false;
    getBusinessHours()
      .then((windows) => {
        if (cancelled) return;
        setBusinessWeek(windowsToWeek(windows));
        setBusinessHasHours(windows.length > 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function copiarHorarioDeLaTienda() {
    if (!businessWeek) return;
    // Copia PROFUNDA: `WeekEditor` muta los tramos del día que edita, y sin esto
    // el segundo profesional heredaría lo que se tocó en el primero.
    setWeek(
      businessWeek.map((d) => ({ ...d, ranges: d.ranges.map((r) => ({ ...r })) })),
    );
    setSaved(false);
    setError(null);
    setCopied(true);
  }

  function selectProfessional(id: string) {
    setSelectedId(id);
    latestRef.current = id;
    setSaved(false);
    setError(null);
    setCopied(false);
    setWeekState("loading");
    getProfessionalSchedule(id)
      .then((windows) => {
        if (latestRef.current !== id) return;
        setWeek(windowsToWeek(windows));
        setWeekState("ready");
      })
      .catch((e) => {
        if (latestRef.current !== id) return;
        setError(e instanceof Error ? e.message : "No se pudo cargar el horario");
        // "idle", NUNCA "ready": en ready el editor quedaba en pantalla con la
        // semana del profesional ANTERIOR (o vacía, si era la primera selección)
        // y el botón activo — un clic la guardaba sobre el recién elegido, o le
        // borraba su horario propio. Sin editor no hay nada que guardar;
        // reintentar es volver a elegirlo en el select.
        setWeekState("idle");
      });
  }

  async function handleSave() {
    const invalid = validateWeek(week);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await putProfessionalSchedule(selectedId, buildWindows(week));
      setSaved(true);
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el horario");
    } finally {
      setSaving(false);
    }
  }

  if (state === "loading") return <Loading rows={2} label="Cargando profesionales…" />;
  if (state === "error")
    return <ErrorState description={loadError ?? undefined} onRetry={retry} />;
  // La sección existe en la nav aunque no haya profesionales: un `null` aquí
  // dejaba el panel completamente en blanco, que se lee como pantalla rota.
  if (professionals.length === 0)
    return (
      <EmptyState
        title="No hay profesionales activos"
        description="Este apartado da a cada profesional un horario distinto al del negocio. Agrega o activa profesionales para usarlo."
      />
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horario por profesional</CardTitle>
        <CardDescription>
          Opcional. Si alguien atiende en horarios distintos a los del negocio,
          defínelos aquí. Sin horario propio, se usa el del negocio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selector y copiar en una sola fila: en el panel ancho, apilados
            dejaban medio metro de aire a la derecha. El botón solo existe con
            un profesional elegido (copiar sin destino no significa nada). */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full space-y-1.5 sm:w-64">
            <Label htmlFor="prof-hours-select">Profesional</Label>
            <Select
              items={professionals.map((p) => ({ value: p.id, label: p.name }))}
              value={selectedId}
              onValueChange={(v) => selectProfessional(v as string)}
            >
              <SelectTrigger id="prof-hours-select" className="w-full">
                <SelectValue placeholder="Elige un profesional" />
              </SelectTrigger>
              <SelectContent>
                {professionals.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {weekState === "ready" && (
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Button
                variant="outline"
                size="sm"
                onClick={copiarHorarioDeLaTienda}
                disabled={!businessWeek || !businessHasHours}
              >
                Copiar el horario de la tienda
              </Button>
              {businessWeek && !businessHasHours ? (
                <span className="text-xs text-muted-foreground">
                  La tienda todavía no tiene horario configurado.
                </span>
              ) : copied ? (
                <span className="text-xs text-muted-foreground">
                  Copiado. Revísalo y guarda.
                </span>
              ) : null}
            </div>
          )}
        </div>

        {weekState === "loading" && <Loading rows={3} label="Cargando horario…" />}

        {/* Error de CARGA (weekState volvió a idle): se dice aquí porque el pie
            con el estado solo existe con el editor en pantalla. */}
        {weekState === "idle" && error && (
          <p role="status" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {weekState === "ready" && (
          <>
            {/* max-w-2xl: las filas del editor son etiqueta y switch a los
                extremos; a ancho completo del panel solo se separan. */}
            <div className="max-w-2xl">
              <WeekEditor
                week={week}
                onChange={(w) => (setWeek(w), setSaved(false), setCopied(false))}
              />
            </div>
            <SaveBar
              label="Guardar horario"
              onSave={handleSave}
              saving={saving}
              saved={saved}
              error={error}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
