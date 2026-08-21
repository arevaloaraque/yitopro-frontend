"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { listAgents, updateAgent } from "@/lib/api/agents";
import { subscribeToEvents } from "@/lib/sse";
import type { Agent } from "@/lib/types";

type LoadState = "loading" | "error" | "ready";

interface AgentsContextValue {
  agents: Agent[];
  state: LoadState;
  error: string | null;
  /** True when at least one agent is enabled (drives the assistant "activa" badge). */
  hasActiveAgents: boolean;
  refetch: () => void;
  /** Optimistically toggle an agent's active flag; rolls back and re-throws on error. */
  toggleActive: (agent: Agent) => Promise<void>;
}

const AgentsContext = createContext<AgentsContextValue | null>(null);

/**
 * Single source of truth for the tenant's agents, mounted once in the
 * authenticated layout. Both the Agents page and the topbar assistant badge
 * consume it, so toggling an agent updates the badge instantly — no refetch.
 */
export function AgentsProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setState("loading");
    setError(null);
    listAgents()
      .then((data) => {
        setAgents(data);
        setState("ready");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Error al cargar agentes");
        setState("error");
      });
  }, []);

  // La carga inicial ES el refetch: el cuerpo estaba escrito dos veces, y una
  // segunda copia de «cómo se cargan los agentes» es la que se olvida de cambiar.
  useEffect(() => {
    const t = setTimeout(refetch, 0);
    return () => clearTimeout(t);
  }, [refetch]);

  // Real-time: another operator/session can change an agent's config —
  // refetch so the topbar badge and the Agents page stay in sync everywhere.
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (event.type === "agente_actualizado") refetch();
    });
    return unsubscribe;
  }, [refetch]);

  const toggleActive = useCallback(async (agent: Agent) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agent.id ? { ...a, is_active: !a.is_active } : a)),
    );
    try {
      await updateAgent(agent.id, { is_active: !agent.is_active });
    } catch (e) {
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, is_active: agent.is_active } : a)),
      );
      throw e;
    }
  }, []);

  const hasActiveAgents = agents.some((a) => a.is_active);

  return (
    <AgentsContext.Provider
      value={{
        agents,
        state,
        error,
        hasActiveAgents,
        refetch,
        toggleActive,
      }}
    >
      {children}
    </AgentsContext.Provider>
  );
}

export function useAgents(): AgentsContextValue {
  const ctx = useContext(AgentsContext);
  if (!ctx) {
    throw new Error("useAgents must be used within an AgentsProvider");
  }
  return ctx;
}
