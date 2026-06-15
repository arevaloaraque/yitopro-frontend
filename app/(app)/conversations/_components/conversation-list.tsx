"use client";

import { MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Loading } from "@/components/states/loading";
import type { Conversation, ConversationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  statusFilter: ConversationStatus | "all";
  onStatusFilterChange: (status: ConversationStatus | "all") => void;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  customerNames: Map<string, string>;
  agentNames: Map<string, string>;
}

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

function statusVariant(
  status: ConversationStatus,
): "default" | "secondary" | "outline" {
  switch (status) {
    case "ai_active":
      return "default";
    case "human_handoff":
      return "secondary";
    case "closed":
      return "outline";
  }
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
  customerNames,
  agentNames,
}: ConversationListProps) {
  if (loading) return <Loading rows={6} className="p-4" />;
  if (error) return <ErrorState onRetry={onRetry} className="m-4" />;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/60 px-3 py-2.5">
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
        {conversations.length === 0 ? (
          <EmptyState
            title="Sin conversaciones"
            description="No hay conversaciones que coincidan con el filtro."
            icon={MessageSquare}
            className="m-4 border-none bg-transparent"
          />
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => onSelect(conv.id)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-border/40 px-4 py-3 text-left transition-all duration-150 hover:bg-muted/30",
                selectedId === conv.id && "bg-muted/60",
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/20">
                {customerNames.get(conv.customer_id)?.charAt(0) ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[0.8rem] font-medium">
                    {customerNames.get(conv.customer_id) ?? conv.customer_id}
                  </span>
                  <span className="shrink-0 text-[0.7rem] text-muted-foreground">
                    {formatTime(conv.last_message_at)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {conv.detected_intent ? (
                    <Badge variant="outline" className="h-4 px-1 text-[10px] leading-none">
                      {conv.detected_intent.replace(/_/g, " ")}
                    </Badge>
                  ) : null}
                  {conv.active_agent ? (
                    <span className="truncate text-[0.7rem] text-muted-foreground">
                      {agentNames.get(conv.active_agent) ?? conv.active_agent}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge
                  variant={statusVariant(conv.status)}
                  className="h-4 px-1 text-[10px] leading-none"
                >
                  {statusLabel(conv.status)}
                </Badge>
                {conv.unread > 0 ? (
                  <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {conv.unread > 9 ? "9+" : conv.unread}
                  </span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
