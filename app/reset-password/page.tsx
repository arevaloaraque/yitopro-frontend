"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";

import { BrandLogo } from "@/components/brand/logo";
import { BootSplash, ErrorState } from "@/components/states";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, confirmPasswordReset, validateResetToken } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  type ResetPasswordValues,
  resetPasswordSchema,
} from "@/lib/validation/schemas";

type TokenStatus = "checking" | "valid" | "invalid";

/** Page chrome shared by every state (brand + theme toggle). */
function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-surface to-background px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandLogo className="text-[26px]" />
        </div>
        {children}
      </div>
    </main>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  // Derive the initial status at render: a missing token is invalid up front, so
  // the effect never needs a synchronous setState.
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>(
    token ? "checking" : "invalid",
  );
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  // Validate the token on load so we can show the form or an "expired" message
  // before the user types anything. This does NOT consume the token.
  useEffect(() => {
    if (!token) return;
    let active = true;
    validateResetToken(token)
      .then((res) => {
        if (active) setTokenStatus(res.valid ? "valid" : "invalid");
      })
      .catch(() => {
        if (active) setTokenStatus("invalid");
      });
    return () => {
      active = false;
    };
  }, [token]);

  // After success, give the user a moment to read the message, then go to login.
  // Scheduling in an effect (not in the handler) means the timer is cleaned up if
  // the component unmounts first, so the redirect can't fire on a dead component.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.replace("/login"), 2500);
    return () => clearTimeout(timer);
  }, [done, router]);

  async function onSubmit(values: ResetPasswordValues) {
    try {
      await confirmPasswordReset(token, values.password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // 400 is either a weak password or a token that died between the
        // validate call and submit — the message explains which.
        setError("root", { message: err.message });
      } else {
        setError("root", {
          message: "No pudimos actualizar la contraseña. Inténtalo de nuevo.",
        });
      }
    }
  }

  if (tokenStatus === "checking") {
    return <BootSplash />;
  }

  if (tokenStatus === "invalid") {
    return (
      <Shell>
        <ErrorState
          title="Enlace inválido o expirado"
          description="Este enlace de recuperación ya no es válido. Solicita uno nuevo para continuar."
          action={
            <Link
              href="/forgot-password"
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
            >
              Solicitar uno nuevo
            </Link>
          }
        />
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <Card elevated>
          <CardHeader className="text-center">
            <div className="mb-2 flex justify-center">
              <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
            </div>
            <CardTitle>Contraseña actualizada</CardTitle>
            <CardDescription>
              Tu contraseña fue cambiada y cerramos las demás sesiones. Te llevamos al inicio
              de sesión…
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full")}
            >
              Ir a iniciar sesión
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card elevated>
        <CardHeader className="text-center">
          <CardTitle>Crea una nueva contraseña</CardTitle>
          <CardDescription>Elige una contraseña segura para tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={isSubmitting}
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-[0.8rem] text-destructive">{errors.password.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={isSubmitting}
                aria-invalid={!!errors.confirmPassword}
                {...register("confirmPassword")}
              />
              {errors.confirmPassword ? (
                <p className="text-[0.8rem] text-destructive">
                  {errors.confirmPassword.message}
                </p>
              ) : null}
            </div>

            {errors.root ? (
              <p role="alert" className="text-[0.8rem] text-destructive">
                {errors.root.message}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Guardando…
                </>
              ) : (
                "Cambiar contraseña"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<BootSplash />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
