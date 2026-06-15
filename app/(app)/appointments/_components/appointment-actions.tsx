"use client";

import { Ban, Clock, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Appointment } from "@/lib/types";

interface AppointmentActionsProps {
  appointment: Appointment;
  onCancel: (appointment: Appointment) => void;
  onReschedule: (appointment: Appointment) => void;
  onHistory: (appointment: Appointment) => void;
}

export function AppointmentActions({
  appointment,
  onCancel,
  onReschedule,
  onHistory,
}: AppointmentActionsProps) {
  const canCancel = appointment.status === "scheduled";
  const canReschedule = appointment.status === "scheduled";

  if (!canCancel && !canReschedule) {
    return (
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onHistory(appointment)}
        aria-label="Ver historial"
      >
        <History className="size-3.5" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label="Acciones de la cita" />
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canReschedule && (
          <DropdownMenuItem onClick={() => onReschedule(appointment)}>
            <Clock className="size-4" />
            Reagendar
          </DropdownMenuItem>
        )}
        {canCancel && (
          <DropdownMenuItem
            onClick={() => onCancel(appointment)}
            className="text-destructive focus:text-destructive"
          >
            <Ban className="size-4" />
            Cancelar
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onHistory(appointment)}>
          <History className="size-4" />
          Historial
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
