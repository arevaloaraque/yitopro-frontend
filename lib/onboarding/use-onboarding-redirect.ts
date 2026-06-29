"use client";

import { useEffect, useState } from "react";

import { getOnboardingStatus } from "@/lib/api/businesses";
import { useAuth } from "@/lib/auth";

export interface OnboardingRedirectResult {
  /** True while authentication is resolving or the status fetch is in flight. */
  loading: boolean;
  /**
   * Where to redirect the user:
   * - `"/onboarding"` when status is not completed (not_started | in_progress)
   * - `null` when completed (stay where you are) or on error (resilient — don't trap)
   */
  target: "/onboarding" | null;
}

/**
 * For an authenticated user, fetches `getOnboardingStatus()` once and returns
 * the appropriate redirect target.
 *
 * Resilient: on fetch error, returns `target: null` — we never trap the user
 * (fallback to dashboard on error).
 */
export function useOnboardingRedirect(): OnboardingRedirectResult {
  const { status: authStatus } = useAuth();
  // null means the fetch hasn't completed yet; object holds the resolved target.
  const [fetched, setFetched] = useState<{ target: "/onboarding" | null } | null>(null);

  useEffect(() => {
    // Only fetch when authenticated — no setState on the unauthenticated/loading path.
    if (authStatus !== "authenticated") return;

    let cancelled = false;

    getOnboardingStatus()
      .then(({ status }) => {
        if (!cancelled) {
          setFetched({ target: status !== "completed" ? "/onboarding" : null });
        }
      })
      .catch(() => {
        // On error: resilient — don't trap the user.
        if (!cancelled) {
          setFetched({ target: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  // Derive loading and target from authStatus + fetched state (no extra setState needed).
  const loading =
    authStatus === "loading" || (authStatus === "authenticated" && fetched === null);
  const target = authStatus === "authenticated" ? (fetched?.target ?? null) : null;
  return { loading, target };
}
