"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getBusiness } from "@/lib/api/businesses";
import { subscribeToEvents } from "@/lib/sse";
import type { Business } from "@/lib/types";

type LoadState = "loading" | "error" | "ready";

interface BusinessContextValue {
  business: Business | null;
  state: LoadState;
  error: string | null;
  refetch: () => void;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

/**
 * Single source of truth for the tenant's business, mounted once in the
 * authenticated layout. Both the Settings page and the topbar assistant badge
 * consume it, so saving a setting updates the badge instantly — no refetch.
 */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setState("loading");
    setError(null);
    getBusiness()
      .then((data) => {
        setBusiness(data);
        setState("ready");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Error al cargar el negocio");
        setState("error");
      });
  }, []);

  // La carga inicial ES el refetch: el cuerpo estaba escrito dos veces, y una
  // segunda copia de «cómo se carga el negocio» es la que se olvida de cambiar.
  useEffect(() => {
    const t = setTimeout(refetch, 0);
    return () => clearTimeout(t);
  }, [refetch]);

  // Real-time: an admin action or another session can flip is_operative —
  // refetch so the topbar badge stays accurate everywhere.
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (event.type === "negocio_actualizado") refetch();
    });
    return unsubscribe;
  }, [refetch]);

  return (
    <BusinessContext.Provider value={{ business, state, error, refetch }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) {
    throw new Error("useBusiness must be used within a BusinessProvider");
  }
  return ctx;
}

/**
 * Same context, `null` instead of a throw when the provider is absent.
 *
 * For consumers where the business only REFINES the output and its absence has a
 * correct fallback — the money formatter's currency, say. Those must not be able to
 * blank a whole screen (or fail a unit test that renders the page in isolation) just
 * because a provider is missing; a consumer that cannot work without the business
 * should keep using `useBusiness` and get the loud error.
 */
export function useBusinessOptional(): BusinessContextValue | null {
  return useContext(BusinessContext);
}
