"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BootSplash } from "@/components/states";
import { useAuth } from "@/lib/auth";
import { useOnboardingRedirect } from "@/lib/onboarding/use-onboarding-redirect";

/**
 * Root gate: sends authenticated users to the right place.
 *
 * - Onboarding not completed → `/onboarding`
 * - Onboarding completed (or status-fetch error) → `/dashboard`
 * - Not authenticated → `RequireAuth` inside the app layout handles `/login`
 *   but here we wait for boot; if unauthenticated we redirect to `/login`.
 */
export default function RootPage() {
  const { status: authStatus } = useAuth();
  const { loading, target } = useOnboardingRedirect();
  const router = useRouter();

  useEffect(() => {
    // Wait until auth boot and status fetch have settled.
    if (authStatus === "loading" || loading) return;

    if (authStatus === "unauthenticated") {
      router.replace("/login");
      return;
    }

    // Authenticated: go to the appropriate destination.
    // target "/onboarding" → not completed; null → completed or error → dashboard.
    router.replace(target ?? "/dashboard");
  }, [authStatus, loading, target, router]);

  // Show splash while deciding.
  return <BootSplash />;
}
