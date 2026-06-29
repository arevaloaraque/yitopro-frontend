"use client";

import { useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnboarding } from "@/lib/onboarding";

type Role = "owner" | "staff";

function roleLabel(role: Role): string {
  return role === "owner" ? "Dueño" : "Staff";
}

/**
 * Step "Usuarios" (optional) — list current users + invite form.
 *
 * - Invite via `inviteUser({ email, role })`.
 * - Remove via `removeUser(id)`; the backend may return 409 (e.g. last owner) —
 *   that message is surfaced inline.
 */
export function StepUsuarios() {
  const { data, inviteUser, removeUser } = useOnboarding();

  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Ingresa un correo.");
      return;
    }
    setInviting(true);
    setError(null);
    try {
      await inviteUser({ email: trimmed, role: "staff" });
      setEmail("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo invitar al usuario.",
      );
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await removeUser(id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo eliminar el usuario.",
      );
    }
  }

  return (
    <div className="space-y-5">
      <ul className="space-y-2">
        {data.users.map((user) => (
          <li
            key={user.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/40 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[0.85rem] text-foreground">
                {user.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[0.65rem]">
                {roleLabel(user.role)}
              </Badge>
              {user.role === "owner" ? null : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemove(user.id)}
                  aria-label={`Eliminar ${user.email}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Invite form */}
      <div className="space-y-3 rounded-xl border border-dashed border-border/60 p-3">
        <p className="text-[0.8rem] font-medium text-foreground">
          Invitar usuario
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="invite-email">
            Correo
          </Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="persona@ejemplo.com"
          />
        </div>
        {error ? (
          <p role="alert" className="text-[0.8rem] text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={handleInvite}
          disabled={inviting}
        >
          {inviting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <UserPlus className="size-3.5" />
          )}
          Invitar usuario
        </Button>
      </div>

      <p className="text-[0.7rem] text-muted-foreground">
        Este paso es opcional: puedes continuar solo con tu cuenta de dueño.
      </p>
    </div>
  );
}
