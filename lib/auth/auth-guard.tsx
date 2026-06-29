"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BootSplash } from "@/components/states";

import { useAuth } from "./useAuth";

interface RequireAuthProps {
  children: React.ReactNode;
  /** Route to redirect to when there is no session. */
  redirectTo?: string;
}

/**
 * Session guard: redirects to `/login` when there is no session.
 * Will be wired into the authenticated layout in F2-A.
 */
export function RequireAuth({ children, redirectTo = "/login" }: RequireAuthProps) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only redirect once boot has ruled out a session. During "loading"
    // (silent refresh in progress) wait, so we don't bounce to /login.
    if (status === "unauthenticated") {
      router.replace(redirectTo);
    }
  }, [status, redirectTo, router]);

  if (status === "loading") return <BootSplash />;
  if (status !== "authenticated") return null;
  return <>{children}</>;
}
