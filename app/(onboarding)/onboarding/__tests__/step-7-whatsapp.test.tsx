import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Step7WhatsApp } from "../_components/step-7-whatsapp";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Focused context mock: tests the rendering branches without wiring the full
// provider + MSW rehydration cycle (the context integration is already covered
// by lib/onboarding/__tests__/onboarding-context.test.tsx).
const mockSetWhatsappConnected = vi.fn();

vi.mock("@/lib/onboarding", () => ({
  useOnboarding: vi.fn(),
}));

// Re-import after mock so we can cast the mock cleanly.
import { useOnboarding } from "@/lib/onboarding";

const mockUseOnboarding = vi.mocked(useOnboarding);

function baseData(overrides: Partial<Parameters<typeof mockUseOnboarding>[0] extends never ? never : ReturnType<typeof mockUseOnboarding>["data"]> = {}) {
  return {
    businessName: "PET Spa",
    country: "CL",
    currency: "CLP",
    language: "es",
    timezone: "America/Santiago",
    professionals: [],
    weeklySchedule: [],
    professionalSchedules: {},
    services: [],
    users: [],
    whatsappConnected: false,
    phoneNumberId: null,
    wabaId: null,
    whatsappNumber: null,
    agents: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseOnboarding.mockReturnValue({
    data: baseData(),
    loading: false,
    loadError: null,
    currentStep: 6,
    setCurrentStep: vi.fn(),
    goNext: vi.fn(),
    goBack: vi.fn(),
    updateBusinessInfo: vi.fn(),
    addProfessional: vi.fn(),
    updateProfessional: vi.fn(),
    removeProfessional: vi.fn(),
    saveWeeklySchedule: vi.fn(),
    saveProfessionalSchedule: vi.fn(),
    addService: vi.fn(),
    updateService: vi.fn(),
    removeService: vi.fn(),
    inviteUser: vi.fn(),
    removeUser: vi.fn(),
    setWhatsappConnected: mockSetWhatsappConnected,
    toggleAgent: vi.fn(),
    setAgentAutonomy: vi.fn(),
    complete: vi.fn(),
    completeError: null,
    missingSteps: [],
    setCompleteError: vi.fn(),
  });
});

describe("Step7WhatsApp — connected state with whatsappNumber present", () => {
  it("renders number + 24/7 copy and recommendation when whatsappNumber is set", () => {
    mockUseOnboarding.mockReturnValue({
      data: baseData({ whatsappConnected: true, whatsappNumber: "+56 9 1234 5678" }),
      loading: false,
      loadError: null,
      currentStep: 6,
      setCurrentStep: vi.fn(),
      goNext: vi.fn(),
      goBack: vi.fn(),
      updateBusinessInfo: vi.fn(),
      addProfessional: vi.fn(),
      updateProfessional: vi.fn(),
      removeProfessional: vi.fn(),
      saveWeeklySchedule: vi.fn(),
      saveProfessionalSchedule: vi.fn(),
      addService: vi.fn(),
      updateService: vi.fn(),
      removeService: vi.fn(),
      inviteUser: vi.fn(),
      removeUser: vi.fn(),
      setWhatsappConnected: mockSetWhatsappConnected,
      toggleAgent: vi.fn(),
      setAgentAutonomy: vi.fn(),
      complete: vi.fn(),
      completeError: null,
      missingSteps: [],
      setCompleteError: vi.fn(),
    });

    render(<Step7WhatsApp />);

    // Title
    expect(screen.getByText("¡WhatsApp conectado!")).toBeInTheDocument();

    // Number emphasised
    expect(screen.getByText("+56 9 1234 5678")).toBeInTheDocument();

    // Key copy landmarks
    expect(screen.getByText(/WhatsApp Business vinculado/)).toBeInTheDocument();
    expect(screen.getByText(/canal de atención principal/)).toBeInTheDocument();

    // Must NOT show the old ID-based copy
    expect(screen.queryByText(/ID:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
  });
});

describe("Step7WhatsApp — connected state with whatsappNumber null (resume)", () => {
  it("renders short fallback copy when whatsappNumber is null", () => {
    mockUseOnboarding.mockReturnValue({
      data: baseData({ whatsappConnected: true, whatsappNumber: null }),
      loading: false,
      loadError: null,
      currentStep: 6,
      setCurrentStep: vi.fn(),
      goNext: vi.fn(),
      goBack: vi.fn(),
      updateBusinessInfo: vi.fn(),
      addProfessional: vi.fn(),
      updateProfessional: vi.fn(),
      removeProfessional: vi.fn(),
      saveWeeklySchedule: vi.fn(),
      saveProfessionalSchedule: vi.fn(),
      addService: vi.fn(),
      updateService: vi.fn(),
      removeService: vi.fn(),
      inviteUser: vi.fn(),
      removeUser: vi.fn(),
      setWhatsappConnected: mockSetWhatsappConnected,
      toggleAgent: vi.fn(),
      setAgentAutonomy: vi.fn(),
      complete: vi.fn(),
      completeError: null,
      missingSteps: [],
      setCompleteError: vi.fn(),
    });

    render(<Step7WhatsApp />);

    // Title
    expect(screen.getByText("¡WhatsApp conectado!")).toBeInTheDocument();

    // Short fallback copy
    expect(
      screen.getByText("Tu WhatsApp Business está conectado y atendiendo 24/7."),
    ).toBeInTheDocument();

    // Must NOT show the old ID-based copy
    expect(screen.queryByText(/ID:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
  });
});
