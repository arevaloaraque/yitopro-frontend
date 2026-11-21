"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useBusinessOptional } from "./business-context";

/**
 * Sends the visitor home when their plan has no assistant.
 *
 * Hiding the nav item is not a barrier — the panel has no middleware, so typing
 * `/conversations` in the address bar loads the route. This is the second half;
 * the first is the router's own 403, which is what actually protects the data.
 *
 * Redirects only on an explicit `false`, the same rule the nav filter and the
 * reports guard follow: while the business is still loading the answer is
 * unknown, and bouncing the customer out of a page they DO have would be the
 * worse failure.
 *
 * Returns `denied` so the caller can render nothing instead of mounting. The
 * redirect is an effect, so without that early return the page renders once,
 * fires its data fetch, and eats a 403 on the way out — visible in the console
 * and pointless, since the visitor is already leaving.
 */
export function useRequireAssistant(): boolean {
  const router = useRouter();
  const business = useBusinessOptional()?.business ?? null;
  const denied = business?.entitlements?.assistant === false;

  useEffect(() => {
    if (denied) router.replace("/dashboard");
  }, [denied, router]);

  return denied;
}
