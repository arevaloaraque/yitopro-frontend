"use client";

import { Sparkles } from "lucide-react";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";
import { useBusinessOptional } from "@/lib/business/business-context";

/**
 * «Sin plan = bloqueado» (2026-08-19).
 *
 * Cuando `entitlements.has_plan` es false:
 * - **Dueño** → overlay bloqueante de fondo opaco sobre TODO el dashboard:
 *   debe elegir un plan antes de operar. Solo informa (la asignación es de
 *   plataforma hoy); el backend además frena la creación por cupo.
 * - **Staff** → se cierra la sesión. El backend ya rechaza su login y su
 *   refresh (403 con el mismo mensaje), así que esto solo adelanta en la UI
 *   lo que la API ya decidió; el aviso se muestra en /login vía el flag.
 *
 * El estado llega solo: BusinessProvider refetchea con cada
 * `negocio_actualizado`, así que un cambio de plan a mitad de sesión dispara
 * esto sin recargar.
 */
export const NO_PLAN_NOTICE_KEY = "yp-no-plan-notice";
export const NO_PLAN_MESSAGE = "El negocio no está activo. Contacta al dueño.";

export function PlanGate({ children }: { children: React.ReactNode }) {
  const business = useBusinessOptional()?.business ?? null;
  const { user, logout } = useAuth();

  // Comparaciones estrictas: mientras el negocio no cargó (undefined) no se
  // bloquea nada — la dirección segura es no echar a nadie por un fetch
  // pendiente. Dos causas, mismo tratamiento para staff; para el dueño el
  // texto del overlay cambia (elegir plan vs. cuenta pausada por la
  // plataforma), y el bloqueo de plataforma manda si coinciden.
  const blockedByPlatform = business?.is_blocked === true;
  const blockedByPlan = business?.entitlements?.has_plan === false;
  const blocked = blockedByPlatform || blockedByPlan;
  const isStaff = user?.role === "staff";

  useEffect(() => {
    if (!blocked || !isStaff) return;
    try {
      sessionStorage.setItem(NO_PLAN_NOTICE_KEY, NO_PLAN_MESSAGE);
    } catch {
      // Storage bloqueado: el login igual mostrará el 403 del backend.
    }
    logout();
  }, [blocked, isStaff, logout]);

  return (
    <>
      {children}
      {blocked && !isStaff ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="plan-gate-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
            <Sparkles className="mx-auto mb-4 size-8 text-primary" aria-hidden />
            <h2 id="plan-gate-title" className="text-lg font-semibold text-foreground">
              {blockedByPlatform ? "Tu negocio no está activo" : "Debes elegir un plan"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {blockedByPlatform
                ? "Tu cuenta está pausada (suspendida o cancelada), así que el panel quedó en espera. Escríbenos para reactivarla."
                : "Tu negocio aún no tiene un plan contratado, así que el panel está en pausa. Escríbenos y lo dejamos activo con el plan que mejor te acomode."}
            </p>
            <p className="mt-4 text-xs text-muted-foreground/80">
              Nada de tu información se pierde: al reactivar, todo vuelve tal
              como estaba.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
