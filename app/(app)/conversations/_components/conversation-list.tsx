"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquare, Search, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Loading } from "@/components/states/loading";
import type { Conversation, ConversationStatus } from "@/lib/types";
import { CustomerRating, ThreadRating } from "@/components/customers/rating";
import { cn, formatNumber } from "@/lib/utils";

import { ConversationPreview } from "./conversation-preview";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  statusFilter: ConversationStatus | "all";
  onStatusFilterChange: (status: ConversationStatus | "all") => void;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  agentNames: Map<string, string>;
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

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return date.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

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
            {formatTime(conv.last_message_at)}
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
  const groups = new Map<string, { key: string; customer: Conversation; threads: Conversation[] }>();
  for (const conv of conversations) {
    const existing = groups.get(conv.customer_id);
    if (existing) existing.threads.push(conv);
    else groups.set(conv.customer_id, { key: conv.customer_id, customer: conv, threads: [conv] });
  }
  return [...groups.values()];
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  statusFilter,
  onStatusFilterChange,
  loading,
  error,
  onRetry,
  agentNames,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  // Por conversación es el default: la vista agrupada se AGREGA, no reemplaza.
  const [view, setView] = useState<InboxView>("thread");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  if (loading) return <Loading rows={6} className="p-4" />;
  if (error) return <ErrorState onRetry={onRetry} className="m-4" />;

  const query = search.trim().toLowerCase();
  // ponytail: filtro client-side sobre la lista ya cargada; migrar a `?search=`
  // cuando el backend lo exponga (hoy la API no lo tiene y trae la lista completa).
  const visible = query
    ? conversations.filter(
        (c) =>
          c.customer_name.toLowerCase().includes(query) ||
          c.customer_phone.toLowerCase().includes(query),
      )
    : conversations;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 border-b border-border/60 px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
            aria-label="Buscar conversaciones"
            className="h-8 pl-8 text-[0.8rem]"
          />
        </div>
        <div className="flex gap-1" role="group" aria-label="Vista del inbox">
          {VIEW_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={view === opt.value ? "secondary" : "ghost"}
              size="xs"
              aria-pressed={view === opt.value}
              onClick={() => setView(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={statusFilter === opt.value ? "secondary" : "ghost"}
              size="xs"
              onClick={() => onStatusFilterChange(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState
            title="Sin conversaciones"
            description="No hay conversaciones que coincidan con el filtro."
            icon={MessageSquare}
            className="m-4 border-none bg-transparent"
          />
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
                        {formatTime(newest.last_message_at)}
                      </span>
                    </div>
                    <ConversationPreview conversation={newest} className="mt-0.5 block" />
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
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
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
      </div>
    </div>
  );
}
