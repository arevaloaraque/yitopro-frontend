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
import type { Agent, AgentAutonomy } from "@/lib/types";

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
  /** Optimistically change an agent's autonomy; rolls back and re-throws on error. */
  changeAutonomy: (agent: Agent, autonomy: AgentAutonomy) => Promise<void>;
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

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      listAgents()
        .then((data) => {
          if (cancelled) return;
          setAgents(data);
          setState("ready");
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "Error al cargar agentes");
          setState("error");
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

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

  const changeAutonomy = useCallback(async (agent: Agent, autonomy: AgentAutonomy) => {
    const prevAutonomy = agent.autonomy;
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, autonomy } : a)));
    try {
      await updateAgent(agent.id, { autonomy });
    } catch (e) {
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, autonomy: prevAutonomy } : a)),
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
        changeAutonomy,
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
