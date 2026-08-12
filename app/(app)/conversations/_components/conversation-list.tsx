"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquare, Search, User } from "lucide-react";

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
import { CustomerRating, ThreadRating } from "@/components/customers/rating";
import {
  CustomerCombobox,
  type CustomerSelection,
} from "@/components/customers/customer-combobox";
import { listDate } from "@/lib/format/date";
import { cn, formatNumber } from "@/lib/utils";

import { ConversationPreview } from "./conversation-preview";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  statusFilter: ConversationStatus | "all";
  onStatusFilterChange: (status: ConversationStatus | "all") => void;
  view: InboxView;
  onViewChange: (view: InboxView) => void;
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
}

export type InboxView = "thread" | "number";

const VIEW_OPTIONS: { value: InboxView; label: string }[] = [
  { value: "thread", label: "Por conversación" },
  { value: "number", label: "Por número" },
];

const STATUS_OPTIONS: { value: ConversationStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "ai_active", label: "IA Activo" },
  { value: "human_handoff", label: "Handoff" },
  { value: "closed", label: "Cerrados" },
];

function statusLabel(status: ConversationStatus): string {
  switch (status) {
    case "ai_active":
      return "IA";
    case "human_handoff":
      return "Handoff";
    case "closed":
      return "Cerrado";
  }
}

function statusVariant(status: ConversationStatus): "info" | "warning" | "outline" {
  switch (status) {
    case "ai_active":
      return "info";
    case "human_handoff":
      return "warning";
    case "closed":
      return "outline";
  }
}

/** One thread. Shared by both views so they can never drift apart. */
function ThreadRow({
  conv,
  selected,
  onSelect,
  agentNames,
  nested = false,
}: {
  conv: Conversation;
  selected: boolean;
  onSelect: (id: string) => void;
  agentNames: Map<string, string>;
  /** Inside a number group: indented, and the name is already on the group header. */
  nested?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(conv.id)}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border/40 px-4 py-3 text-left transition-all duration-150 hover:bg-muted/30",
        nested && "border-b-0 py-2 pl-12",
        selected && "bg-muted/60",
      )}
    >
      {nested ? null : (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <User className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[0.8rem] font-medium">
            {nested
              ? statusLabel(conv.status)
              : conv.customer_name.trim() || formatNumber(conv.customer_phone)}
          </span>
          <span className="shrink-0 text-[0.7rem] text-muted-foreground">
            {listDate(conv.last_message_at)}
          </span>
        </div>
        {/* Preview estilo WhatsApp: una línea, truncada, con quién escribió. */}
        <div className="mt-0.5 flex items-center gap-1.5">
          <ConversationPreview conversation={conv} className="min-w-0 flex-1" />
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {conv.active_agent ? (
            <span className="truncate text-[0.65rem] text-muted-foreground/80">
              {agentNames.get(conv.active_agent) ?? conv.active_agent}
            </span>
          ) : null}
          {/* La nota de ESTE hilo (el promedio de la persona va en el encabezado del grupo). */}
          <ThreadRating value={conv.customer_rating} status={conv.rating_status} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {nested ? null : (
          <Badge
            variant={statusVariant(conv.status)}
            className="h-4 px-1 text-[10px] leading-none"
          >
            {statusLabel(conv.status)}
          </Badge>
        )}
        {conv.unread > 0 ? (
          <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {conv.unread > 9 ? "9+" : conv.unread}
          </span>
        ) : null}
      </div>
    </button>
  );
}

/**
 * Groups threads by CUSTOMER (which is the phone number: `Customer.phone` identifies the
 * person and is immutable, so keying on the id is the same grouping and survives a rename).
 * Order is preserved from the incoming list, which the API already sorts by last activity,
 * so the newest group stays on top and each group's newest thread is first.
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

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  statusFilter,
  onStatusFilterChange,
  view,
  onViewChange,
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
}: ConversationListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const query = search.trim();
  const filtersActive = statusFilter !== "all" || customer !== null || query !== "";

  // El recorte lo hace el SERVIDOR (`?search=`, `?status=`, `?customer_id=`): lo que llega en
  // `conversations` ya es la página filtrada. Filtrar además aquí sería «lo que coincide de
  // las 25 filas que bajé», que es un filtro que miente en cuanto la bandeja crece.
  const visible = conversations;

  return (
    <div className="flex h-full flex-col">
      {/* Los filtros se dibujan SIEMPRE, también mientras carga y cuando falla: son la única
          salida de un filtro que dejó la bandeja vacía, y esconderlos deja al operador
          encerrado en el recorte que acaba de poner. */}
      <div className="shrink-0 border-b border-border/60 p-3">
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
                aria-label="Buscar conversaciones"
                aria-describedby="conv-search-hint"
                className="h-8 pl-8 text-[0.8rem]"
              />
            </div>
            {/* Busca en TODO el historial del negocio, en el servidor. Ya NO advierte de
                acentos: el backend pasó a comparar sin ellos («areva» llega a «Arévalo»),
                así que la advertencia anterior mandaba a escribir el nombre «como está
                guardado» para un problema que dejó de existir. Un aviso caducado gasta la
                confianza del operador igual que un buscador roto. */}
            <p id="conv-search-hint" className="text-xs text-muted-foreground">
              Busca en todo el historial por nombre o teléfono, aunque sea parte. No
              distingue mayúsculas ni acentos.
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
            {/* `gap-1.5` y `size="sm"` (28px): antes eran 24px separados por 4px. No se
                agranda más porque a partir de ahí los cuatro objetivos se tocan, y dos
                destinos pegados se pulsan mal más veces que uno pequeño. */}
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

          <div className="flex flex-col gap-1.5">
            <span id="conv-view-label" className="text-sm leading-none font-medium">
              Vista
            </span>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-labelledby="conv-view-label"
            >
              {VIEW_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={view === opt.value ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={view === opt.value}
                  onClick={() => onViewChange(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </FilterBar>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <Loading rows={6} className="p-4" />
        ) : error ? (
          <ErrorState onRetry={onRetry} className="m-4" />
        ) : visible.length === 0 ? (
          // Los dos vacíos no son el mismo: «todavía no ha escrito nadie» se arregla
          // esperando, «tu filtro no encontró nada» se arregla quitando el filtro, y hasta
          // ahora la bandeja daba el segundo texto incluso sin ningún filtro puesto.
          filtersActive ? (
            <EmptyState
              title="Sin resultados"
              description="Ninguna conversación coincide con estos filtros."
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
              description="Cuando un cliente escriba por WhatsApp, su conversación aparecerá aquí."
              icon={MessageSquare}
              className="m-4 border-none bg-transparent"
            />
          )
        ) : view === "thread" ? (
          visible.map((conv) => (
            <ThreadRow
              key={conv.id}
              conv={conv}
              selected={selectedId === conv.id}
              onSelect={onSelect}
              agentNames={agentNames}
            />
          ))
        ) : (
          groupByNumber(visible).map((group) => {
            const isCollapsed = collapsed.has(group.key);
            const name =
              group.customer.customer_name.trim() ||
              formatNumber(group.customer.customer_phone);
            // El hilo más reciente del grupo: la lista ya viene ordenada por actividad.
            const newest = group.threads[0];
            const hasSelected = group.threads.some((t) => t.id === selectedId);
            return (
              <div key={group.key} className="border-b border-border/40">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30",
                    hasSelected && "bg-muted/40",
                  )}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <User className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[0.8rem] font-medium">{name}</span>
                      <span className="shrink-0 text-[0.7rem] text-muted-foreground">
                        {listDate(newest.last_message_at)}
                      </span>
                    </div>
                    <ConversationPreview
                      conversation={newest}
                      className="mt-0.5 block"
                    />
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[0.65rem] text-muted-foreground">
                        {group.threads.length === 1
                          ? "1 conversación"
                          : `${group.threads.length} conversaciones`}
                      </span>
                      {/* El promedio DE LA PERSONA, del backend — no el de los hilos en
                          pantalla, que solo promediaría los cargados y calificados. */}
                      <CustomerRating
                        avg={group.customer.customer_rating_avg}
                        count={group.customer.customer_rating_count}
                        compact
                      />
                    </div>
                  </div>
                  {isCollapsed ? (
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  ) : (
                    <ChevronDown
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                </button>
                {isCollapsed
                  ? null
                  : group.threads.map((conv) => (
                      <ThreadRow
                        key={conv.id}
                        conv={conv}
                        selected={selectedId === conv.id}
                        onSelect={onSelect}
                        agentNames={agentNames}
                        nested
                      />
                    ))}
              </div>
            );
          })
        )}
        {/* Sin total: el backend no manda `count` a propósito (un `COUNT(*)` sobre el recorte
            relee todas las filas que coinciden, en cada página, y la bandeja es la tabla que
            crece para siempre). Por eso el pie dice «25 conversaciones (hay más)». */}
        {!loading && !error && visible.length > 0 ? (
          <div className="px-4 py-3">
            <ListFooter
              shown={visible.length}
              hasMore={hasMore}
              loading={loadingMore}
              onLoadMore={onLoadMore}
              noun="conversación"
              nounPlural="conversaciones"
            />
            {/* El botón sigue ahí (el cursor no se movió), así que reintentar es un clic; lo
                que falta cuando esto se calla es saber que falló. */}
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
