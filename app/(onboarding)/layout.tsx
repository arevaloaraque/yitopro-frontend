"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand/logo";
import { BootSplash } from "@/components/states";
import { getOnboardingStatus } from "@/lib/api/businesses";
import { RequireAuth, useAuth } from "@/lib/auth";

/**
 * Guards completed users from re-running the wizard.
 * Only renders children when onboarding is NOT completed.
 * On API error, lets the user through (resilient — don't block the wizard).
 */
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { status: authStatus } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (authStatus !== "authenticated") return;

    let cancelled = false;
    (async () => {
      try {
        const { status } = await getOnboardingStatus();
        if (cancelled) return;
        if (status === "completed") {
          // Completed → redirect away; stay null until navigation completes.
          router.replace("/dashboard");
        } else {
          // Not completed → let the wizard render.
          setChecked(true);
        }
      } catch {
        // On error: let the user stay (resilient — don't block the wizard).
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authStatus, router]);

  if (!checked) return <BootSplash />;
  return <>{children}</>;
}

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <OnboardingGuard>
        <div className="flex min-h-svh flex-col bg-background">
          <header className="flex h-16 shrink-0 items-center border-b border-border/40 px-6">
            <BrandLogo className="text-[20px]" />
          </header>
          <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-6 py-10">
            {children}
          </main>
        </div>
      </OnboardingGuard>
    </RequireAuth>
  );
}
