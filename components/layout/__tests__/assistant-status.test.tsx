/**
 * AssistantStatus badge: "activa" only when the business is operative AND has at
 * least one enabled agent. Business and agents come from the shared
 * BusinessProvider/AgentsProvider, so a toggle or a settings save updates the
 * badge live — without this component re-fetching anything itself.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentsProvider, useAgents } from "@/lib/agents";
import { listAgents, updateAgent } from "@/lib/api/agents";
import { getBusiness } from "@/lib/api/businesses";
import { BusinessProvider } from "@/lib/business";
import type { Agent, Business } from "@/lib/types";

import { AssistantStatus } from "../assistant-status";

vi.mock("@/lib/api/businesses", () => ({
  getBusiness: vi.fn(),
  updateBusiness: vi.fn(),
}));
vi.mock("@/lib/api/agents", () => ({ listAgents: vi.fn(), updateAgent: vi.fn() }));
vi.mock("@/lib/sse", () => ({ subscribeToEvents: vi.fn(() => () => {}) }));

function makeBusiness(over: Partial<Business> = {}): Business {
  return {
    id: "1",
    name: "PET Spa",
    country: "CL",
    address: "",
    currency: "CLP",
    language: "es",
    timezone: "America/Santiago",
    is_active: true,
    is_operative: true,
    is_blocked: false,
    whatsapp_connected: true,
    whatsapp_number: "+56 9 1111 2222",
    entitlements: {
      assistant: true,
      agents: ["scheduling", "sales"],
      max_professionals: 0,
      max_users: 0,
      plan_name: "",
      has_plan: true,
      active_professionals: 0,
      active_users: 1,
    max_agents: 0,
    max_reminder_rules: 0,
    can_edit_automation_timing: true,
    },
    onboarding_status: "completed",
    assistant_config: {
      display_name: "Maya",
      tone: "friendly",
      welcome_message: "",
    },
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: "scheduling",
    business_id: "1",
    name: "Agente de agenda",
    type: "scheduling",
    is_active: true,
    ...over,
  };
}

/** Minimal consumer that toggles an agent through the shared provider. */
function ToggleProbe({ agent }: { agent: Agent }) {
  const { toggleActive } = useAgents();
  return <button onClick={() => toggleActive(agent).catch(() => {})}>toggle</button>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AssistantStatus", () => {
  it("shows 'activa' when operative and at least one agent is enabled", async () => {
    vi.mocked(getBusiness).mockResolvedValue(makeBusiness());
    vi.mocked(listAgents).mockResolvedValue([makeAgent({ is_active: true })]);

    render(
      <BusinessProvider>
        <AgentsProvider>
          <AssistantStatus />
        </AgentsProvider>
      </BusinessProvider>,
    );

    expect(await screen.findByText("activa")).toBeInTheDocument();
  });

  it("shows 'en pausa' when operative but no agent is enabled", async () => {
    vi.mocked(getBusiness).mockResolvedValue(makeBusiness());
    vi.mocked(listAgents).mockResolvedValue([makeAgent({ is_active: false })]);

    render(
      <BusinessProvider>
        <AgentsProvider>
          <AssistantStatus />
        </AgentsProvider>
      </BusinessProvider>,
    );

    expect(await screen.findByText("en pausa")).toBeInTheDocument();
  });

  it("shows 'en pausa' when not operative even if an agent is enabled", async () => {
    vi.mocked(getBusiness).mockResolvedValue(makeBusiness({ is_operative: false }));
    vi.mocked(listAgents).mockResolvedValue([makeAgent({ is_active: true })]);

    render(
      <BusinessProvider>
        <AgentsProvider>
          <AssistantStatus />
        </AgentsProvider>
      </BusinessProvider>,
    );

    expect(await screen.findByText("en pausa")).toBeInTheDocument();
  });

  it("updates to 'en pausa' live when the last agent is toggled off, without re-fetching the business", async () => {
    const agent = makeAgent({ is_active: true });
    vi.mocked(getBusiness).mockResolvedValue(makeBusiness());
    vi.mocked(listAgents).mockResolvedValue([agent]);
    vi.mocked(updateAgent).mockResolvedValue({ ...agent, is_active: false });

    render(
      <BusinessProvider>
        <AgentsProvider>
          <AssistantStatus />
          <ToggleProbe agent={agent} />
        </AgentsProvider>
      </BusinessProvider>,
    );

    expect(await screen.findByText("activa")).toBeInTheDocument();

    await userEvent.click(screen.getByText("toggle"));

    expect(await screen.findByText("en pausa")).toBeInTheDocument();
    // The badge reacted to the shared agent state — it did NOT call the backend again.
    expect(getBusiness).toHaveBeenCalledTimes(1);
  });
});
