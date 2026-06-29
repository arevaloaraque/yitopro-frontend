"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  completeOnboarding,
  createProfessional,
  createService,
  deleteProfessional,
  deleteService,
  deleteUser,
  getBusiness,
  getBusinessSchedule,
  getOnboardingStatus,
  inviteUser as apiInviteUser,
  listAgents,
  listProfessionals,
  listServices,
  listUsers,
  putBusinessSchedule,
  putProfessionalSchedule,
  updateAgent as apiUpdateAgent,
  updateBusiness,
  updateProfessional as apiUpdateProfessional,
  updateService as apiUpdateService,
  type CreateServiceInput,
} from "@/lib/api";
import type {
  AgentAutonomy,
  AgentType,
  ScheduleWindow,
  Service,
} from "@/lib/types";

import {
  createEmptyOnboardingData,
  type OnboardingData,
  type OnboardingStep,
  TOTAL_STEPS,
} from "./types";

const STEP_STORAGE_KEY = "onboarding_step";

interface OnboardingContextValue {
  data: OnboardingData;
  loading: boolean;
  /** Set when the initial server rehydration fails. */
  loadError: string | null;

  currentStep: OnboardingStep;
  setCurrentStep: (step: OnboardingStep) => void;
  goNext: () => void;
  goBack: () => void;

  // Step 1 — Business info
  updateBusinessInfo: (info: {
    businessName: string;
    country: string;
    currency: string;
    language: string;
    timezone: string;
  }) => Promise<void>;

  // Step 2 — Professionals
  addProfessional: (name: string) => Promise<void>;
  updateProfessional: (
    id: string,
    patch: { name?: string; is_active?: boolean },
  ) => Promise<void>;
  removeProfessional: (id: string) => Promise<void>;

  // Step 3 — Schedules
  saveWeeklySchedule: (windows: ScheduleWindow[]) => Promise<void>;
  saveProfessionalSchedule: (
    id: string,
    windows: ScheduleWindow[],
  ) => Promise<void>;

  // Step 4 — Services
  addService: (input: CreateServiceInput) => Promise<void>;
  updateService: (
    id: string,
    patch: Partial<Omit<Service, "id" | "business_id">>,
  ) => Promise<void>;
  removeService: (id: string) => Promise<void>;

  // Step 5 — Users
  inviteUser: (input: {
    email: string;
    role: "owner" | "staff";
  }) => Promise<void>;
  removeUser: (id: string) => Promise<void>;

  // Step 6 — WhatsApp (Embedded Signup real; network call lives in the step)
  setWhatsappConnected: (phoneNumberId: string, wabaId: string, displayPhoneNumber: string | null) => void;

  // Step 7 — Agents
  toggleAgent: (type: AgentType, isActive: boolean) => Promise<void>;
  setAgentAutonomy: (type: AgentType, autonomy: AgentAutonomy) => Promise<void>;

  // Step 8 — Confirm
  complete: () => Promise<void>;
  completeError: string | null;
  missingSteps: string[];
  setCompleteError: (err: string | null) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData>(createEmptyOnboardingData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(STEP_STORAGE_KEY);
      if (saved) {
        const n = Number(saved);
        if (n >= 1 && n <= TOTAL_STEPS) return n as OnboardingStep;
      }
    }
    return 1;
  });

  // ── Rehydrate from the server on mount ────────────────────────────────────
  // `data` is sourced from the backend, never from storage; only `currentStep`
  // persists to sessionStorage for tab-local convenience.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [professionals, services, users, agents, business] =
          await Promise.all([
            listProfessionals(),
            listServices(),
            listUsers(),
            listAgents(),
            getBusiness(),
          ]);
        if (cancelled) return;
        let weeklySchedule: ScheduleWindow[] = [];
        try {
          weeklySchedule = await getBusinessSchedule();
        } catch {
          // non-fatal — grid starts empty, user re-saves
        }
        let whatsappConnected = false;
        try {
          const onboardingStatus = await getOnboardingStatus();
          whatsappConnected =
            onboardingStatus.steps.find((s) => s.key === "whatsapp")
              ?.completed ?? false;
        } catch {
          // non-fatal — leave false; user will reconnect if needed
        }
        if (cancelled) return;
        setData((prev) => ({
          ...prev,
          businessName: business.name,
          country: business.country,
          currency: business.currency,
          language: business.language,
          timezone: business.timezone,
          professionals,
          services,
          users,
          agents,
          weeklySchedule,
          whatsappConnected,
        }));
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Error al cargar el onboarding.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist only the current step (non-secret, tab-local convenience).
  useEffect(() => {
    try {
      sessionStorage.setItem(STEP_STORAGE_KEY, String(currentStep));
    } catch {
      // storage unavailable — silently degrade
    }
  }, [currentStep]);

  const goNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS) as OnboardingStep);
  }, []);

  const goBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 1) as OnboardingStep);
  }, []);

  // ── Step 1 — Business info ────────────────────────────────────────────────
  const updateBusinessInfo = useCallback(
    async (info: {
      businessName: string;
      country: string;
      currency: string;
      language: string;
      timezone: string;
    }) => {
      const business = await updateBusiness({
        name: info.businessName,
        country: info.country,
        currency: info.currency,
        language: info.language,
        timezone: info.timezone,
      });
      setData((prev) => ({
        ...prev,
        businessName: business.name,
        country: business.country,
        currency: business.currency,
        language: business.language,
        timezone: business.timezone,
      }));
    },
    [],
  );

  // ── Step 2 — Professionals ────────────────────────────────────────────────
  const addProfessional = useCallback(async (name: string) => {
    const professional = await createProfessional({ name });
    setData((prev) => ({
      ...prev,
      professionals: [...prev.professionals, professional],
    }));
  }, []);

  const updateProfessional = useCallback(
    async (id: string, patch: { name?: string; is_active?: boolean }) => {
      const professional = await apiUpdateProfessional(id, patch);
      setData((prev) => ({
        ...prev,
        professionals: prev.professionals.map((p) =>
          p.id === id ? professional : p,
        ),
      }));
    },
    [],
  );

  const removeProfessional = useCallback(async (id: string) => {
    await deleteProfessional(id);
    setData((prev) => {
      const { [id]: _removed, ...professionalSchedules } =
        prev.professionalSchedules;
      return {
        ...prev,
        professionals: prev.professionals.filter((p) => p.id !== id),
        professionalSchedules,
      };
    });
  }, []);

  // ── Step 3 — Schedules ────────────────────────────────────────────────────
  const saveWeeklySchedule = useCallback(async (windows: ScheduleWindow[]) => {
    await putBusinessSchedule(windows);
    setData((prev) => ({ ...prev, weeklySchedule: windows }));
  }, []);

  const saveProfessionalSchedule = useCallback(
    async (id: string, windows: ScheduleWindow[]) => {
      const saved = await putProfessionalSchedule(id, windows);
      setData((prev) => ({
        ...prev,
        professionalSchedules: { ...prev.professionalSchedules, [id]: saved },
      }));
    },
    [],
  );

  // ── Step 4 — Services ─────────────────────────────────────────────────────
  const addService = useCallback(async (input: CreateServiceInput) => {
    const service = await createService(input);
    setData((prev) => ({ ...prev, services: [...prev.services, service] }));
  }, []);

  const updateService = useCallback(
    async (id: string, patch: Partial<Omit<Service, "id" | "business_id">>) => {
      const service = await apiUpdateService(id, patch);
      setData((prev) => ({
        ...prev,
        services: prev.services.map((s) => (s.id === id ? service : s)),
      }));
    },
    [],
  );

  const removeService = useCallback(async (id: string) => {
    await deleteService(id);
    setData((prev) => ({
      ...prev,
      services: prev.services.filter((s) => s.id !== id),
    }));
  }, []);

  // ── Step 5 — Users ────────────────────────────────────────────────────────
  const inviteUser = useCallback(
    async (input: { email: string; role: "owner" | "staff" }) => {
      const user = await apiInviteUser(input);
      setData((prev) => ({ ...prev, users: [...prev.users, user] }));
    },
    [],
  );

  const removeUser = useCallback(async (id: string) => {
    await deleteUser(id);
    setData((prev) => ({
      ...prev,
      users: prev.users.filter((u) => u.id !== id),
    }));
  }, []);

  // ── Step 6 — WhatsApp ─────────────────────────────────────────────────────
  // The network call (Embedded Signup callback) already happened in the step
  // component; here we only record the resulting connection in local state.
  const setWhatsappConnected = useCallback(
    (phoneNumberId: string, wabaId: string, displayPhoneNumber: string | null) => {
      setData((prev) => ({
        ...prev,
        whatsappConnected: true,
        phoneNumberId,
        wabaId,
        whatsappNumber: displayPhoneNumber,
      }));
    },
    [],
  );

  // ── Step 7 — Agents ───────────────────────────────────────────────────────
  // Agents are addressed by their `type` (the backend route key).
  const toggleAgent = useCallback(
    async (type: AgentType, isActive: boolean) => {
      const agent = await apiUpdateAgent(type, { is_active: isActive });
      setData((prev) => ({
        ...prev,
        agents: prev.agents.map((a) => (a.type === type ? agent : a)),
      }));
    },
    [],
  );

  const setAgentAutonomy = useCallback(
    async (type: AgentType, autonomy: AgentAutonomy) => {
      const agent = await apiUpdateAgent(type, { autonomy });
      setData((prev) => ({
        ...prev,
        agents: prev.agents.map((a) => (a.type === type ? agent : a)),
      }));
    },
    [],
  );

  // ── Step 8 — Confirm ──────────────────────────────────────────────────────
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [missingSteps, setMissingSteps] = useState<string[]>([]);

  const complete = useCallback(async () => {
    setCompleteError(null);
    setMissingSteps([]);
    const result = await completeOnboarding();
    if (result.ok) {
      router.push("/dashboard");
      return;
    }
    setMissingSteps(result.missing_steps ?? []);
    setCompleteError(
      "Faltan pasos por completar antes de finalizar el onboarding.",
    );
  }, [router]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      data,
      loading,
      loadError,
      currentStep,
      setCurrentStep,
      goNext,
      goBack,
      updateBusinessInfo,
      addProfessional,
      updateProfessional,
      removeProfessional,
      saveWeeklySchedule,
      saveProfessionalSchedule,
      addService,
      updateService,
      removeService,
      inviteUser,
      removeUser,
      setWhatsappConnected,
      toggleAgent,
      setAgentAutonomy,
      complete,
      completeError,
      missingSteps,
      setCompleteError,
    }),
    [
      data,
      loading,
      loadError,
      currentStep,
      goNext,
      goBack,
      updateBusinessInfo,
      addProfessional,
      updateProfessional,
      removeProfessional,
      saveWeeklySchedule,
      saveProfessionalSchedule,
      addService,
      updateService,
      removeService,
      inviteUser,
      removeUser,
      setWhatsappConnected,
      toggleAgent,
      setAgentAutonomy,
      complete,
      completeError,
      missingSteps,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding debe usarse dentro de <OnboardingProvider>.");
  }
  return ctx;
}
