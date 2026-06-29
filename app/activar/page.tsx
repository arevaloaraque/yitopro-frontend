"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import { ApiError, validateInvite } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { type ActivateValues, activateSchema } from "@/lib/validation/schemas";

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

function ActivarInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const { acceptInvite } = useAuth();

  // A missing token is invalid immediately; skip the validate network call.
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>(
    token ? "checking" : "invalid",
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ActivateValues>({
    resolver: zodResolver(activateSchema),
    defaultValues: { password: "", confirm: "" },
  });

  // Validate the token on mount. Does NOT consume it.
  useEffect(() => {
    if (!token) return;
    let active = true;
    validateInvite(token)
      .then((valid) => {
        if (active) setTokenStatus(valid ? "valid" : "invalid");
      })
      .catch(() => {
        if (active) setTokenStatus("invalid");
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function onSubmit(values: ActivateValues) {
    try {
      await acceptInvite(token, values.password);
      router.replace("/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // Backend message explains what's wrong (weak password, expired token, …).
        setError("root", { message: err.message });
      } else {
        setError("root", {
          message: "No pudimos activar tu cuenta. Inténtalo de nuevo.",
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
          description="El enlace de activación es inválido o expiró. Pide uno nuevo."
          action={
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Volver al inicio
            </Link>
          }
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <Card elevated>
        <CardHeader className="text-center">
          <CardTitle>Crea tu contraseña</CardTitle>
          <CardDescription>Elige una contraseña segura para activar tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
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
              <Label htmlFor="confirm">Confirmar contraseña</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={isSubmitting}
                aria-invalid={!!errors.confirm}
                {...register("confirm")}
              />
              {errors.confirm ? (
                <p className="text-[0.8rem] text-destructive">{errors.confirm.message}</p>
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
                  Activando…
                </>
              ) : (
                "Activar cuenta"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}

export default function ActivarPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<BootSplash />}>
      <ActivarInner />
    </Suspense>
  );
}
