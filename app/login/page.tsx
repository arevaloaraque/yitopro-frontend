"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand/logo";
import { BootSplash } from "@/components/states";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NO_PLAN_NOTICE_KEY } from "@/components/layout/plan-gate";
import { ApiError, getOnboardingStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSubmitGuard } from "@/lib/hooks/use-submit-guard";
import { type LoginValues, loginSchema } from "@/lib/validation/schemas";

/** Fetches onboarding status and returns the target route. Resilient: on error → "/dashboard". */
async function resolvePostLoginTarget(): Promise<"/onboarding" | "/dashboard"> {
  try {
    const { status } = await getOnboardingStatus();
    return status !== "completed" ? "/onboarding" : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

export default function LoginPage() {
  const { login, isAuthenticated, status } = useAuth();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // If there's already a session, redirect to the right place.
  useEffect(() => {
    if (!isAuthenticated) return;
    void resolvePostLoginTarget().then((target) => router.replace(target));
  }, [isAuthenticated, router]);

  // Aviso dejado por PlanGate al cerrar la sesión de un staff cuyo negocio
  // quedó sin plan: se muestra una vez y se limpia.
  useEffect(() => {
    try {
      const notice = sessionStorage.getItem(NO_PLAN_NOTICE_KEY);
      if (notice) {
        sessionStorage.removeItem(NO_PLAN_NOTICE_KEY);
        setError("root", { message: notice });
      }
    } catch {
      // Storage bloqueado: sin aviso, el 403 del backend igual lo explica.
    }
  }, [setError]);

  const submitGuard = useSubmitGuard();
  const onSubmit = (values: LoginValues) => submitGuard(() => doLogin(values));

  async function doLogin(values: LoginValues) {
    try {
      await login(values.email, values.password);
      const target = await resolvePostLoginTarget();
      router.replace(target);
    } catch (err) {
      setError("root", {
        message:
          err instanceof ApiError && err.status === 401
            ? "Email o contraseña incorrectos."
            : err instanceof ApiError && err.status === 403
              ? // «Sin plan = bloqueado»: el backend responde 403 con el
                // mensaje para staff de un negocio sin plan — se muestra tal cual.
                err.message
              : "No pudimos conectar con el servidor. Inténtalo de nuevo.",
      });
    }
  }

  // During boot (silent refresh) or if there's already a session, don't show the
  // form: it restores/redirects without flicker.
  if (status === "loading" || isAuthenticated) {
    return <BootSplash />;
  }

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-surface to-background px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandLogo className="text-[26px]" />
        </div>

        <Card elevated>
          <CardHeader className="text-center">
            <CardTitle as="h1">Inicia sesión</CardTitle>
            <CardDescription>Accede al panel de tu negocio</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="off"
                  placeholder="tu@negocio.com"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email ? (
                  <p className="text-[0.8rem] text-destructive">
                    {errors.email.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="off"
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
                {errors.password ? (
                  <p className="text-[0.8rem] text-destructive">
                    {errors.password.message}
                  </p>
                ) : null}
                <div className="text-right">
                  <Link
                    href="/forgot-password"
                    className="text-[0.8rem] font-medium text-primary hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
              </div>

              {errors.root ? (
                <p role="alert" className="text-[0.8rem] text-destructive">
                  {errors.root.message}
                </p>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Entrando…
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
