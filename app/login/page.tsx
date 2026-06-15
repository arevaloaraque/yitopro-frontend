"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
import { useAuth } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si ya hay sesión, no mostramos el login.
  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Ingresa tu email y contraseña.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError("Ingresa un email válido.");
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch {
      setError("No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-surface to-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Image
            src="/brand/horizontal.svg"
            alt="Yitopro"
            width={160}
            height={44}
            priority
          />
        </div>

        <Card elevated>
          <CardHeader className="text-center">
            <CardTitle>Inicia sesión</CardTitle>
            <CardDescription>Accede al panel de tu negocio</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@negocio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  aria-invalid={error !== null}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  aria-invalid={error !== null}
                />
              </div>

              {error ? (
                <p role="alert" className="text-[0.8rem] text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Entrando…
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>

            <p className="mt-4 text-center text-[0.7rem] text-muted-foreground">
              Modo demo: cualquier email y contraseña funcionan.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
