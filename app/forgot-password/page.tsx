"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { BrandLogo } from "@/components/brand/logo";
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
import { ApiError, requestPasswordReset } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  type ForgotPasswordValues,
  forgotPasswordSchema,
} from "@/lib/validation/schemas";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    try {
      await requestPasswordReset(values.email);
      // The backend never reveals whether the email exists, so we always show
      // the same generic confirmation.
      setSent(true);
    } catch (err) {
      setError("root", {
        message:
          err instanceof ApiError && err.status === 429
            ? "Demasiados intentos. Inténtalo de nuevo en unos minutos."
            : "No pudimos procesar la solicitud. Inténtalo de nuevo.",
      });
    }
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
          {sent ? (
            <>
              <CardHeader className="text-center">
                <div className="mb-2 flex justify-center">
                  <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
                </div>
                <CardTitle>Revisa tu correo</CardTitle>
                <CardDescription>
                  Si el correo está registrado, te enviamos un enlace para restablecer tu
                  contraseña. El enlace caduca en unos minutos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
                >
                  Volver a iniciar sesión
                </Link>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="text-center">
                <CardTitle>Recupera tu contraseña</CardTitle>
                <CardDescription>
                  Ingresa tu email y te enviaremos un enlace para crear una nueva contraseña.
                </CardDescription>
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

                  {errors.root ? (
                    <p role="alert" className="text-[0.8rem] text-destructive">
                      {errors.root.message}
                    </p>
                  ) : null}

                  <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Enviando…
                      </>
                    ) : (
                      "Enviar enlace"
                    )}
                  </Button>

                  <div className="text-center">
                    <Link
                      href="/login"
                      className="text-[0.8rem] font-medium text-primary hover:underline"
                    >
                      Volver a iniciar sesión
                    </Link>
                  </div>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
