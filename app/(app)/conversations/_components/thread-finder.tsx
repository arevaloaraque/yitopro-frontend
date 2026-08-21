"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DateTarget } from "@/lib/conversations/thread";
import type { SearchState } from "@/lib/conversations/use-customer-thread";
import { formatDateTime, todayISO } from "@/lib/format/date";

interface ThreadFinderProps {
  search: SearchState;
  /** Se dispara con Enter o con el botón. NUNCA con debounce — ver abajo. */
  onSearch: (q: string) => void;
  onCancel: () => void;
  onClear: () => void;
  onContinue: () => void;
  onGoto: (i: number) => void;
  /** Día `YYYY-MM-DD`. */
  onJumpToDate: (day: string) => void;
  dateNotice: DateTarget | null;
  onDismissNotice: () => void;
  /** `min` del campo de fecha: solo cuando el índice está COMPLETO. */
  minDay: string | null;
  jumping: boolean;
  onClose: () => void;
}

/**
 * El panel de búsqueda del chat: texto y fecha, como el de WhatsApp Web.
 *
 * ## Por qué la búsqueda no tiene debounce
 *
 * No hay búsqueda de texto sobre mensajes en la API, así que buscar significa
 * BAJAR el historial del número. Con `useDebounced` cada pulsación costaría
 * decenas de requests. Es lo contrario del buscador de la bandeja —que sí filtra
 * en el servidor y sí va con debounce— y por eso está escrito acá.
 *
 * ## El alcance se muestra, no se insinúa
 *
 * Nunca «sin resultados» a secas: siempre cuántos mensajes se revisaron, desde
 * cuándo, y cuántas conversaciones quedan sin revisar. Y el aviso fijo de que la
 * búsqueda es **solo dentro de este número**: en WhatsApp el campo de la lista
 * busca en mensajes y acá no puede, así que el parecido invita a esperarlo.
 */
export function ThreadFinder({
  search,
  onSearch,
  onCancel,
  onClear,
  onContinue,
  onGoto,
  onJumpToDate,
  dateNotice,
  onDismissNotice,
  minDay,
  jumping,
  onClose,
}: ThreadFinderProps) {
  const [q, setQ] = useState(search.query);
  const [day, setDay] = useState("");

  return (
    <aside
      aria-label="Buscar en la conversación"
      className="flex w-full shrink-0 flex-col border-l border-border/60 bg-card lg:w-80"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold">Buscar en el chat</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Cerrar búsqueda"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-4 overflow-y-auto p-4">
        {/* ── Texto ── */}
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(q);
          }}
        >
          <Label htmlFor="thread-q">Texto del mensaje</Label>
          <div className="flex gap-1.5">
            <Input
              id="thread-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="palabra o frase"
              aria-describedby="thread-q-hint"
            />
            <Button type="submit" size="icon" aria-label="Buscar">
              <Search className="size-4" />
            </Button>
          </div>
          <p id="thread-q-hint" className="text-[0.7rem] text-muted-foreground">
            Busca solo dentro de este número. Se revisa el historial al pulsar buscar.
          </p>
        </form>

        {search.query ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.7rem] font-medium" role="status">
                {search.hits.length === 0 && !search.running
                  ? "Sin coincidencias"
                  : `${search.hits.length} coincidencia${search.hits.length === 1 ? "" : "s"}`}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={search.hits.length === 0}
                  onClick={() => onGoto(search.active - 1)}
                  aria-label="Coincidencia anterior"
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={search.hits.length === 0}
                  onClick={() => onGoto(search.active + 1)}
                  aria-label="Coincidencia siguiente"
                >
                  <ChevronDown className="size-4" />
                </Button>
              </div>
            </div>

            {/* El alcance, siempre con números y fecha. */}
            <p className="text-[0.7rem] text-muted-foreground">
              {search.running ? "Revisando… " : ""}
              {search.scanned} mensaje{search.scanned === 1 ? "" : "s"} revisado
              {search.scanned === 1 ? "" : "s"}
              {search.since ? `, desde el ${formatDateTime(search.since)}` : ""}.
              {search.pending > 0
                ? search.pending === 1
                  ? " Falta 1 conversación más vieja."
                  : ` Faltan ${search.pending} conversaciones más viejas.`
                : " Se revisó todo el historial."}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {search.running ? (
                <Button variant="outline" size="xs" onClick={onCancel}>
                  Detener
                </Button>
              ) : null}
              {search.paused || (!search.running && search.pending > 0) ? (
                <Button variant="secondary" size="xs" onClick={onContinue}>
                  Seguir buscando
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setQ("");
                  onClear();
                }}
              >
                Limpiar
              </Button>
            </div>

            <ul className="space-y-1">
              {search.hits.map((h, i) => (
                <li key={h.messageId}>
                  <button
                    type="button"
                    onClick={() => onGoto(i)}
                    aria-current={i === search.active ? "true" : undefined}
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-[0.7rem] transition-colors hover:bg-muted/60 ${
                      i === search.active ? "bg-muted/60" : ""
                    }`}
                  >
                    <span className="block text-muted-foreground">
                      {formatDateTime(h.createdAt)}
                    </span>
                    <span className="line-clamp-2 text-foreground">{h.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ── Fecha ── */}
        <div className="space-y-1.5 border-t border-border/60 pt-4">
          <Label htmlFor="thread-day">Ir a una fecha</Label>
          <div className="flex gap-1.5">
            <Input
              id="thread-day"
              type="date"
              value={day}
              min={minDay ?? undefined}
              max={todayISO()}
              onChange={(e) => setDay(e.target.value)}
            />
            <Button
              size="xs"
              disabled={!day || jumping}
              onClick={() => onJumpToDate(day)}
            >
              {jumping ? "…" : "Ir"}
            </Button>
          </div>
          {minDay === null ? (
            <p className="text-[0.7rem] text-muted-foreground">
              Todavía no se conoce todo el historial: si la fecha es anterior a lo
              cargado, se pide más.
            </p>
          ) : null}

          {dateNotice ? (
            <div role="status" className="rounded-lg bg-muted/60 p-2 text-[0.7rem]">
              {dateNotice.kind === "before-all" ? (
                <p>El historial de este número empieza el {dateNotice.firstDay}.</p>
              ) : dateNotice.kind === "after-all" ? (
                <p>Esa fecha es posterior al último mensaje: ya estás en el final.</p>
              ) : dateNotice.kind === "gap" ? (
                <p>
                  Nadie escribió ese día. Lo más cercano son las conversaciones vecinas
                  — elegí una fecha dentro de alguna.
                </p>
              ) : (
                <p>
                  Esa fecha está más atrás de lo que se alcanzó. Pulsá «Ir» otra vez
                  para seguir bajando historial.
                </p>
              )}
              <button
                type="button"
                onClick={onDismissNotice}
                className="mt-1 underline hover:no-underline"
              >
                Entendido
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
