"use client";

import { Loader2, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activateUser, deleteUser, inviteUser, listUsers } from "@/lib/api/users";
import { useAuth } from "@/lib/auth";
import { useBusiness } from "@/lib/business";
import type { SystemUser } from "@/lib/types";

/**
 * Equipo: quién tiene acceso al panel, con activar/desactivar.
 *
 * Esta pantalla es la mitad visible del contrato de cupos por plan
 * (2026-08-19): los asientos son los usuarios ACTIVOS, así que el swap es
 * desactivar a uno y activar a otro. Un downgrade desactiva a los más nuevos
 * marcándolos «por el plan» (badge); al subir de plan se restauran solos, y el
 * dueño también puede reactivarlos aquí — el backend re-chequea el cupo y su
 * 403 se muestra tal cual.
 */
export function TeamManagement() {
  const { user } = useAuth();
  const { business, refetch: refetchBusiness } = useBusiness();
  const isOwner = user?.role === "owner";

  const [users, setUsers] = useState<SystemUser[] | null>(null);
  const [email, setEmail] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setUsers(await listUsers());
    } catch {
      setError("No se pudo cargar el equipo. Recarga la página.");
    }
  }, []);

  useEffect(() => {
    // Mismo patrón que BusinessProvider: diferido un tick para no setear
    // estado dentro del cuerpo del efecto (regla react-hooks del repo).
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [reload]);

  // Tras cualquier mutación: la lista Y los contadores del plan (entitlements)
  // cambian juntos, así que se refrescan juntos.
  async function mutate(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await reload();
      refetchBusiness();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción.");
    }
  }

  async function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Ingresa un correo.");
      return;
    }
    setInviting(true);
    await mutate(() => inviteUser({ email: trimmed, role: "staff" }));
    setInviting(false);
    setEmail("");
  }

  async function handleToggle(target: SystemUser) {
    setBusyId(target.id);
    await mutate(() =>
      target.is_active ? deleteUser(target.id) : activateUser(target.id),
    );
    setBusyId(null);
  }

  const ent = business?.entitlements;
  const seatLine =
    ent && ent.max_users > 0 ? `${ent.active_users} de ${ent.max_users} asientos en uso` : null;

  if (users === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando equipo…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {seatLine ? <p className="text-xs text-muted-foreground">{seatLine}</p> : null}

      <ul className="space-y-2">
        {users.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/40 p-3"
          >
            <div className="min-w-0">
              <p
                className={
                  member.is_active
                    ? "truncate text-[0.85rem] text-foreground"
                    : "truncate text-[0.85rem] text-muted-foreground line-through"
                }
              >
                {member.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[0.65rem]">
                {member.role === "owner" ? "Dueño" : "Staff"}
              </Badge>
              {!member.is_active && (
                <Badge variant="outline" className="text-[0.65rem] text-muted-foreground">
                  {member.deactivated_by_plan ? "Desactivado por el plan" : "Inactivo"}
                </Badge>
              )}
              {isOwner && member.role !== "owner" ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busyId === member.id}
                  onClick={() => handleToggle(member)}
                  aria-label={
                    member.is_active
                      ? `Desactivar ${member.email}`
                      : `Reactivar ${member.email}`
                  }
                  className={
                    member.is_active
                      ? "text-muted-foreground hover:text-destructive"
                      : "text-muted-foreground hover:text-primary"
                  }
                >
                  {busyId === member.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : member.is_active ? (
                    <UserMinus className="size-4" />
                  ) : (
                    <UserCheck className="size-4" />
                  )}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-[0.8rem] text-destructive">
          {error}
        </p>
      ) : null}

      {isOwner ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border/60 p-3">
          <p className="text-[0.8rem] font-medium text-foreground">Invitar usuario</p>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="team-invite-email">
              Correo
            </Label>
            <Input
              id="team-invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@ejemplo.com"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleInvite} disabled={inviting}>
            {inviting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <UserPlus className="size-3.5" />
            )}
            Invitar usuario
          </Button>
        </div>
      ) : (
        <p className="text-[0.7rem] text-muted-foreground">
          Solo el dueño puede invitar, activar o desactivar personas.
        </p>
      )}
    </div>
  );
}
