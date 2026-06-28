"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Image from "next/image";
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
import { BootSplash } from "@/components/states";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { type LoginValues, loginSchema } from "@/lib/validation/schemas";

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

  // Si ya hay sesión, no mostramos el login.
  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  async function onSubmit(values: LoginValues) {
    try {
      await login(values.email, values.password);
      router.replace("/dashboard");
    } catch (err) {
      setError("root", {
        message:
          err instanceof ApiError && err.status === 401
            ? "Email o contraseña incorrectos."
            : "No pudimos conectar con el servidor. Inténtalo de nuevo.",
      });
    }
  }

  // Durante el arranque (refresh silencioso) o si ya hay sesión, no mostramos el
  // formulario: se restaura/redirige sin parpadeo.
  if (status === "loading" || isAuthenticated) {
    return <BootSplash />;
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-surface to-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Image src="/brand/horizontal.svg" alt="Yitopro" width={160} height={44} priority />
        </div>

        <Card elevated>
          <CardHeader className="text-center">
            <CardTitle>Inicia sesión</CardTitle>
            <CardDescription>Accede al panel de tu negocio</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@negocio.com"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email ? (
                  <p className="text-[0.8rem] text-destructive">{errors.email.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
                {errors.password ? (
                  <p className="text-[0.8rem] text-destructive">{errors.password.message}</p>
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
