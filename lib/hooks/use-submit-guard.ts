"use client";

import { useCallback, useRef } from "react";

/**
 * Single-flight anti doble-submit: mientras una invocación está en vuelo,
 * las demás se ignoran de forma síncrona (el ref cambia antes de cualquier re-render).
 */
export function useSubmitGuard() {
  const inFlight = useRef(false);
  return useCallback(async (fn: () => Promise<unknown> | unknown) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await fn();
    } finally {
      inFlight.current = false;
    }
  }, []);
}
