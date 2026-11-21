"use client";

import { MessageSquare, Search, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListFooter } from "@/components/ui/list-footer";
import { FilterBar } from "@/components/filters/filter-bar";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Loading } from "@/components/states/loading";
import type { Conversation, ConversationStatus } from "@/lib/types";
import { CustomerRating } from "@/components/customers/rating";
import {
  CustomerCombobox,
  type CustomerSelection,
} from "@/components/customers/customer-combobox";
import { listDate } from "@/lib/format/date";
import { cn, formatNumber } from "@/lib/utils";

import { ConversationPreview } from "./conversation-preview";

interface ConversationListProps {
  conversations: Conversation[];
  /** El NÚMERO abierto (id de cliente), no una conversación. */
  selectedCustomerId: string | null;
  onSelect: (customerId: string) => void;
  statusFilter: ConversationStatus | "all";
  onStatusFilterChange: (status: ConversationStatus | "all") => void;
  /** Texto crudo del buscador. La página lo retrasa y lo manda a `?search=`. */
  search: string;
  onSearchChange: (value: string) => void;
  /** Cliente elegido: filtro de SERVIDOR (`?customer_id=`), no un recorte local. */
  customer: CustomerSelection;
  onCustomerChange: (customer: CustomerSelection) => void;
  onClearFilters: () => void;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  agentNames: Map<string, string>;
  /** Paginación por cursor: hay más páginas, pero no hay total (el backend no lo manda). */
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Falló pedir la página siguiente. Va al pie: no reemplaza la lista ya cargada. */
  moreError: string | null;
  /**
   * La última página no agregó ningún número nuevo (todas sus conversaciones eran
   * de gente ya listada). Hay que decirlo: un botón que no cambia nada se lee como
   * roto.
   */
  lastPageAddedNothing: boolean;
}

const STATUS_OPTIONS: { value: ConversationStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "ai_active", label: "IA Activo" },
  { value: "human_handoff", label: "Handoff" },
  { value: "closed", label: "Cerrados" },
];

/**
 * Etiqueta corta, para el badge de la fila (4px de alto: «Handoff Humano» no cabe).
 *
 * Es la ÚNICA copia dentro de esta carpeta y la importan la fila y la cabecera del
 * hilo. Las de `dashboard`, `customer-drawer` y `order-detail-dialog` quedan como
 * están: unificarlas es otra tarea y toca tres pantallas ajenas.
 */
export function statusLabel(status: Conversation["status"]): string {
  switch (status) {
    case "ai_active":
      return "IA";
    case "human_handoff":
      return "Handoff";
    case "closed":
      return "Cerrado";
  }
}

/** La etiqueta larga, para el nombre accesible y para la cabecera del hilo. */
function statusLabelLong(status: Conversation["status"]): string {
  switch (status) {
    case "ai_active":
      return "IA activa";
    case "human_handoff":
      return "Derivada a una persona";
    case "closed":
      return "Cerrada";
  }
}

export function statusVariant(
  status: Conversation["status"],
): "info" | "warning" | "outline" {
  switch (status) {
    case "ai_active":
      return "info";
    case "human_handoff":
      return "warning";
    case "closed":
      return "outline";
  }
}

/**
 * Agrupa por CLIENTE, que es el número: `Customer.phone` identifica a la persona y
 * es inmutable, así que agrupar por su id es la misma agrupación y sobrevive a un
 * cambio de nombre. El orden de llegada se preserva —la API ya ordena por
 * actividad—, así que el grupo más nuevo queda arriba y su hilo más reciente es el
 * primero.
 */
function groupByNumber(conversations: Conversation[]) {
  const groups = new Map<
    string,
    { key: string; customer: Conversation; threads: Conversation[] }
  >();
  for (const conv of conversations) {
    const existing = groups.get(conv.customer_id);
    if (existing) existing.threads.push(conv);
    else
      groups.set(conv.customer_id, {
        key: conv.customer_id,
        customer: conv,
        threads: [conv],
      });
  }
  return [...groups.values()];
}

/**
 * Una fila = un número = un tab stop.
 *
 * Lo que la fila puede decir con honestidad: el nombre, la fecha y el preview de la
 * última actividad (el orden fijo del servidor garantiza que el primer hilo que
 * aparece de esa persona es su más reciente), el estado de ESA conversación, el
 * promedio DE LA PERSONA —que lo calcula el backend sobre todas sus conversaciones,
 * no sobre las cargadas— y los no leídos.
 *
 * Lo que NO puede decir: **cuántas conversaciones tiene**. Ese conteo solo abarcaría
 * las páginas descargadas, que es el filtro-que-miente que este archivo condena más
 * abajo. El número real lo muestra el hilo, que sí pide el índice completo del
 * cliente.
 */
function NumberRow({
  group,
  selected,
  onSelect,
  agentNames,
}: {
  group: { key: string; customer: Conversation; threads: Conversation[] };
  selected: boolean;
  onSelect: (customerId: string) => void;
  agentNames: Map<string, string>;
}) {
  const newest = group.threads[0];
  const name = newest.customer_name.trim() || formatNumber(newest.customer_phone);
  const unread = group.threads.reduce((n, t) => n + t.unread, 0);
  const agentName = newest.active_agent
    ? (agentNames.get(newest.active_agent) ?? newest.active_agent)
    : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(group.key)}
      // La selección se comunicaba SOLO con fondo: sin esto no existe para un
      // lector de pantalla y falla el criterio de no depender del color.
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border/40 px-4 py-3 text-left transition-all duration-150 hover:bg-muted/30",
        selected && "bg-muted/60",
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <User className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[0.8rem] font-medium">{name}</span>
          <span className="shrink-0 text-[0.7rem] text-muted-foreground">
            {listDate(newest.last_message_at)}
          </span>
        </div>
        <ConversationPreview conversation={newest} className="mt-0.5 block" />
        <div className="mt-1 flex items-center gap-2">
          {newest.customer_rating_count > 0 ? (
            <span className="text-[0.65rem] text-muted-foreground">Trato:</span>
          ) : null}
          <CustomerRating
            avg={newest.customer_rating_avg}
            count={newest.customer_rating_count}
            compact
          />
          {agentName ? (
            <span className="truncate text-[0.65rem] text-muted-foreground/80">
              {agentName}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {/* El badge dice «IA» y fuera de contexto no significa nada, así que el
            nombre accesible lo dice largo y el badge se oculta al lector. */}
        <Badge
          variant={statusVariant(newest.status)}
          className="h-4 px-1 text-[10px] leading-none"
          aria-hidden
        >
          {statusLabel(newest.status)}
        </Badge>
        {unread > 0 ? (
          <span
            aria-hidden
            className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </div>
      <span className="sr-only">
        Última conversación: {statusLabelLong(newest.status)}.
        {/* El backend NO expone «no leídos»: esto cuenta los mensajes que llegaron
            con esta pestaña abierta. Decir «sin leer» a secas afirmaría que no hay
            nada pendiente cuando el contador está en cero, y eso no se sabe. */}
        {unread > 0
          ? ` ${unread} ${unread === 1 ? "mensaje" : "mensajes"} desde que abriste el panel.`
          : ""}
      </span>
    </button>
  );
}

export function ConversationList({
  conversations,
  selectedCustomerId,
  onSelect,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
  customer,
  onCustomerChange,
  onClearFilters,
  loading,
  error,
  onRetry,
  agentNames,
  hasMore,
  loadingMore,
  onLoadMore,
  moreError,
  lastPageAddedNothing,
}: ConversationListProps) {
  const query = search.trim();
  const filtersActive = statusFilter !== "all" || customer !== null || query !== "";

  // El recorte lo hace el SERVIDOR (`?search=`, `?status=`, `?customer_id=`): lo que llega en
  // `conversations` ya es la página filtrada. Filtrar además aquí sería «lo que coincide de
  // las 25 filas que bajé», que es un filtro que miente en cuanto la bandeja crece.
  const groups = groupByNumber(conversations);

  return (
    <div className="flex h-full flex-col">
      {/* Los filtros se dibujan SIEMPRE, también mientras carga y cuando falla: son la única
          salida de un filtro que dejó la bandeja vacía, y esconderlos deja al operador
          encerrado en el recorte que acaba de poner. */}
      <div className="shrink-0 border-b border-border/60 p-3">
        {/* La pantalla necesita un `h1`: sin esto el encabezado más alto era el `h2`
            del hilo, que solo existe con un chat abierto. */}
        <h1 className="sr-only">Conversaciones por número</h1>
        <FilterBar active={filtersActive} onClear={onClearFilters}>
          <div className="flex w-full flex-col gap-1.5">
            <Label htmlFor="conv-search">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="conv-search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Nombre o teléfono"
                aria-label="Buscar por nombre o teléfono"
                aria-describedby="conv-search-hint"
                className="h-8 pl-8 text-[0.8rem]"
              />
            </div>
            {/* Sigue diciendo nombre/teléfono a propósito: la API no busca en el texto de los
                mensajes, y ahora que la pantalla se comporta como WhatsApp —donde este campo
                SÍ busca en mensajes— la expectativa es más fuerte. Buscar contenido existe,
                pero dentro de un chat. */}
            <p id="conv-search-hint" className="text-xs text-muted-foreground">
              Busca por nombre o teléfono, aunque sea parte. Para buscar texto de los
              mensajes, abrí un chat y usá su buscador.
            </p>
          </div>

          <div className="flex w-full flex-col gap-1.5">
            <Label htmlFor="conv-customer">Cliente</Label>
            <CustomerCombobox
              id="conv-customer"
              value={customer}
              onChange={onCustomerChange}
              placeholder="Todos los clientes"
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span id="conv-status-label" className="text-sm leading-none font-medium">
              Estado
            </span>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-labelledby="conv-status-label"
            >
              {STATUS_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={statusFilter === opt.value ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={statusFilter === opt.value}
                  onClick={() => onStatusFilterChange(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </FilterBar>

        {/* El filtro selecciona CONVERSACIONES y la lista muestra NÚMEROS, así que
            la misma persona se ve distinta con filtro y sin filtro. Hay que decirlo:
            si no, la fila parece equivocada. */}
        {statusFilter !== "all" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Números con conversaciones{" "}
            <strong className="font-medium">
              {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label}
            </strong>
            . Cada fila resume solo esas. El chat siempre muestra el historial completo.
          </p>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <Loading rows={6} className="p-4" />
        ) : error ? (
          <ErrorState onRetry={onRetry} className="m-4" />
        ) : groups.length === 0 ? (
          // Los dos vacíos no son el mismo: «todavía no ha escrito nadie» se arregla
          // esperando, «tu filtro no encontró nada» se arregla quitando el filtro.
          filtersActive ? (
            <EmptyState
              title="Sin resultados"
              description="Ningún número coincide con estos filtros."
              icon={Search}
              action={
                <Button variant="outline" size="sm" onClick={onClearFilters}>
                  Limpiar filtros
                </Button>
              }
              className="m-4 border-none bg-transparent"
            />
          ) : (
            <EmptyState
              title="Sin conversaciones"
              description="Cuando un cliente escriba por WhatsApp, su número aparecerá aquí."
              icon={MessageSquare}
              className="m-4 border-none bg-transparent"
            />
          )
        ) : (
          groups.map((group) => (
            <NumberRow
              key={group.key}
              group={group}
              selected={selectedCustomerId === group.key}
              onSelect={onSelect}
              agentNames={agentNames}
            />
          ))
        )}

        {!loading && !error && groups.length > 0 ? (
          <div className="px-4 py-3">
            {/* Las DOS cifras, porque la relación entre ellas es el dato: el servidor
                pagina conversaciones y la lista muestra números, así que 25
                conversaciones pueden ser 12 filas. Sin total: el backend no manda
                `count` a propósito. */}
            <ListFooter
              shown={groups.length}
              hasMore={hasMore}
              loading={loadingMore}
              onLoadMore={onLoadMore}
              noun="número"
              nounPlural="números"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {conversations.length === 1
                ? "1 conversación cargada"
                : `${conversations.length} conversaciones cargadas`}
            </p>
            {lastPageAddedNothing ? (
              <p role="status" className="mt-1 text-xs text-muted-foreground">
                La última página no agregó números nuevos: todas sus conversaciones eran
                de gente que ya estaba en la lista.
              </p>
            ) : null}
            {moreError ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {moreError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
