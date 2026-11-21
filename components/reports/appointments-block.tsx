"use client";

import { CalendarCheck } from "lucide-react";

import { RankList } from "@/components/reports/rank-list";
import { ReportCard } from "@/components/reports/report-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ValueSummary } from "@/lib/api/reports";
import { useCountUp } from "@/lib/hooks/use-count-up";
import { useGrowBars } from "@/lib/motion";

type AgendaData = NonNullable<ValueSummary["blocks"]["appointments"]>;

/** «Todos» no es un id: el Select necesita un valor no vacío para esa opción. */
export const ALL_PROFESSIONALS = "todos";

/** Tope del contrato (`RANK_LIMIT` del backend). Se nombra en pantalla: una
 *  lista recortada que no lo dice se lee como el equipo completo. */
const RANK_LIMIT = 20;

/**
 * Bloque de agenda. Tres lecturas con gates independientes: lo que agendó la
 * IA, el reparto por profesional y el reparto por servicio. Cada clave se
 * dibuja solo si el backend la mandó — `null` significa que ese gate está
 * cerrado, y una tarjeta que solo puede leer cero no es un dato del negocio.
 *
 * El selector de profesional vive AQUÍ y no en la barra de la página: es el
 * único sitio donde cambia algo (los cobros no tienen profesional y las
 * conversaciones tampoco), y arriba dejaría media pantalla inmóvil, que se
 * lee como un filtro roto.
 */
export function AppointmentsBlock({
  agenda,
  professionalId,
  onProfessionalChange,
  animate,
}: {
  agenda: AgendaData;
  professionalId?: number;
  onProfessionalChange: (id: number | undefined) => void;
  animate: boolean;
}) {
  const {
    ai_active_count: aiCount,
    by_professional: byPro,
    by_service: byService,
  } = agenda;
  const ref = useGrowBars<HTMLDivElement>(animate);
  // El hook va incondicional (regla de los hooks); con la clave en `null` el
  // valor simplemente no se pinta.
  const aiShown = useCountUp(aiCount ?? 0, animate);

  // Las opciones salen del PROPIO ranking, así que solo lista profesionales con
  // citas vigentes en la ventana: no es un selector del equipo completo, y a
  // propósito — ofrecer a alguien cuyo único resultado posible es «sin citas»
  // es ofrecer un callejón sin salida. Con menos de dos, el desplegable es
  // ruido: el reparto ya es la respuesta entera.
  const showSelector = (byPro?.length ?? 0) > 1;
  const selected =
    professionalId !== undefined ? String(professionalId) : ALL_PROFESSIONALS;
  const options = [
    { value: ALL_PROFESSIONALS, label: "Todos" },
    ...(byPro ?? []).map((p) => ({ value: String(p.id), label: p.name })),
  ];

  return (
    <ReportCard
      title="Agenda"
      subtitle="Citas creadas en el período, sin las canceladas. No mide asistencia."
      icon={CalendarCheck}
      link={{ href: "/appointments", label: "Ver agenda" }}
    >
      <div ref={ref} className="space-y-5">
        {aiCount !== null ? (
          // El contador de la IA va en el CONTENIDO, no en la cabecera: allí
          // desplazaba el arranque del contenido respecto de las tarjetas
          // vecinas de la misma fila. Su gate es propio, así que puede faltar.
          <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
            El asistente agendó{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {aiShown.toLocaleString("es-CL")}
            </span>{" "}
            {aiCount === 1 ? "cita vigente" : "citas vigentes"} en este período.
          </p>
        ) : null}
        {showSelector ? (
          // El filtro va DENTRO del contenido, no en la cabecera: ahí ocupaba
          // el sitio del icono y dejaba esta tarjeta con una anatomía distinta
          // de todas las demás.
          <Select
            items={options}
            value={selected}
            onValueChange={(v) =>
              onProfessionalChange(
                !v || v === ALL_PROFESSIONALS ? undefined : Number(v),
              )
            }
          >
            <SelectTrigger
              aria-label="Filtrar por profesional"
              className="w-full data-[size=default]:h-11 sm:data-[size=default]:h-9"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {/* Apilados, porque la tarjeta ocupa UNA columna de la grilla: en dos
            columnas internas de ~160 px los nombres se recortarían. Lo que
            mantiene la altura a raya es el colapso de cada lista. */}
        <div className="space-y-5">
          {byPro ? (
            <RankList
              title="Citas agendadas por profesional"
              rows={byPro.map((r) => ({ id: r.id, name: r.name, value: r.scheduled }))}
              emptyLabel="Sin citas en el período."
            />
          ) : null}
          {byService ? (
            <RankList
              title="Citas agendadas por servicio"
              rows={byService.map((r) => ({
                id: r.id,
                name: r.name,
                value: r.scheduled,
              }))}
              emptyLabel={
                professionalId !== undefined
                  ? "Este profesional no tiene citas en el período."
                  : "Sin citas en el período."
              }
            />
          ) : null}
        </div>
        {showSelector ? (
          <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
            El filtro solo acota el reparto por servicio; cada lista llega hasta{" "}
            {RANK_LIMIT} filas.
          </p>
        ) : null}
      </div>
    </ReportCard>
  );
}
