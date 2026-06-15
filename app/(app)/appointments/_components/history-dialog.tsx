"use client";

import { useEffect, useState } from "react";
import { Clock, History, Plus, X, RefreshCw, CheckCircle2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAppointmentHistory } from "@/lib/api";
import type { AppointmentAuditEntry } from "@/lib/types";

interface HistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string | null;
}

const EVENT_ICONS: Record<AppointmentAuditEntry["event"], typeof Clock> = {
  created: Plus,
  cancelled: X,
  rescheduled: RefreshCw,
  completed: CheckCircle2,
};

const EVENT_LABELS: Record<AppointmentAuditEntry["event"], string> = {
  created: "Creada",
  cancelled: "Cancelada",
  rescheduled: "Reagendada",
  completed: "Completada",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryDialog({
  open,
  onOpenChange,
  appointmentId,
}: HistoryDialogProps) {
  const [entries, setEntries] = useState<AppointmentAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !appointmentId) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading guard pattern
    setLoading(true);
    getAppointmentHistory(appointmentId)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, appointmentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Historial de cambios</DialogTitle>
          <DialogDescription>
            Cronología de eventos de esta cita.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cargando historial…
            </p>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <History className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Sin historial disponible.
              </p>
            </div>
          ) : (
            <div className="relative ml-3 border-l border-border py-2 pl-6">
              {entries.map((entry) => {
                const Icon = EVENT_ICONS[entry.event];
                return (
                  <div key={entry.id} className="relative pb-4 last:pb-0">
                    <span className="absolute -left-[1.31rem] flex size-5 items-center justify-center rounded-full border border-border bg-background">
                      <Icon className="size-3 text-muted-foreground" />
                    </span>
                    <p className="text-sm font-medium text-foreground">
                      {EVENT_LABELS[entry.event]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(entry.timestamp)}
                    </p>
                    {entry.details && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entry.details}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
