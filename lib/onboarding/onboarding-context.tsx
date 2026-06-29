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
  createProduct,
  createRecordSchema,
  createService,
  updateAgent as apiUpdateAgent,
  updateBusiness,
} from "@/lib/api";
import type { Agent, Product, RecordField, Service } from "@/lib/types";
import { INDUSTRY_TEMPLATES } from "./templates";
import {
  createEmptyOnboardingData,
  type OnboardingData,
  type OnboardingStep,
  TOTAL_STEPS,
} from "./types";

let idCounter = 0;

function tempId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_tmp_${idCounter}`;
}

interface OnboardingContextValue {
  data: OnboardingData;
  currentStep: OnboardingStep;
  setCurrentStep: (step: OnboardingStep) => void;
  goNext: () => void;
  goBack: () => void;

  // Step 1
  updateBusinessInfo: (info: {
    businessName: string;
    country: string;
    currency: string;
    language: string;
    timezone: string;
  }) => void;

  // Step 2
  selectTemplate: (templateId: string) => void;

  // Step 3 — Services
  updateService: (id: string, patch: Partial<Service>) => void;
  removeService: (id: string) => void;
  addService: () => void;

  // Step 4 — Products
  updateProduct: (id: string, patch: Partial<Product>) => void;
  removeProduct: (id: string) => void;
  addProduct: () => void;

  // Step 5 — Record fields
  updateRecordField: (index: number, patch: Partial<RecordField>) => void;
  removeRecordField: (index: number) => void;
  addRecordField: () => void;

  // Step 6 — Agents
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  toggleAgentSkill: (agentId: string, skill: string) => void;

  // Step 7 — WhatsApp (Embedded Signup real)
  setWhatsappConnected: (phoneNumberId: string, wabaId: string) => void;

  // Step 9 — Activation
  activate: () => Promise<void>;
  activateError: string | null;
  setActivateError: (err: string | null) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("onboarding_data");
        if (saved) return JSON.parse(saved) as OnboardingData;
      } catch {
        // corrupted data, start fresh
      }
    }
    return createEmptyOnboardingData();
  });
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("onboarding_step");
      if (saved) return Number(saved) as OnboardingStep;
    }
    return 1;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem("onboarding_data", JSON.stringify(data));
      sessionStorage.setItem("onboarding_step", String(currentStep));
    } catch {
      // storage full or unavailable — silently degrade
    }
  }, [data, currentStep]);

  const goNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS) as OnboardingStep);
  }, []);

  const goBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 1) as OnboardingStep);
  }, []);

  const updateBusinessInfo = useCallback(
    (info: {
      businessName: string;
      country: string;
      currency: string;
      language: string;
      timezone: string;
    }) => {
      setData((prev) => ({
        ...prev,
        businessName: info.businessName,
        country: info.country,
        currency: info.currency,
        language: info.language,
        timezone: info.timezone,
      }));
    },
    [],
  );

  const selectTemplate = useCallback((templateId: string) => {
    const template = INDUSTRY_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    const services: Service[] = template.services.map((s) => ({
      ...s,
      id: tempId("svc"),
      business_id: "",
    }));

    const products: Product[] = template.products.map((p) => ({
      ...p,
      id: tempId("prd"),
      business_id: "",
    }));

    const agents: Agent[] = template.agents.map((a) => ({
      ...a,
      id: tempId("agt"),
      business_id: "",
    }));

    setData((prev) => ({
      ...prev,
      selectedTemplate: template,
      services,
      products,
      recordFields: template.recordFields.map((f) => ({
        ...f,
        _key: tempId("rf"),
      })),
      agents,
    }));
  }, []);

  const updateService = useCallback((id: string, patch: Partial<Service>) => {
    setData((prev) => ({
      ...prev,
      services: prev.services.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    }));
  }, []);

  const removeService = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      services: prev.services.filter((s) => s.id !== id),
    }));
  }, []);

  const addService = useCallback(() => {
    setData((prev) => ({
      ...prev,
      services: [
        ...prev.services,
        {
          id: tempId("svc"),
          business_id: "",
          name: "",
          duration_minutes: 30,
          price: 0,
          is_active: true,
        },
      ],
    }));
  }, []);

  const updateProduct = useCallback((id: string, patch: Partial<Product>) => {
    setData((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    }));
  }, []);

  const removeProduct = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== id),
    }));
  }, []);

  const addProduct = useCallback(() => {
    setData((prev) => ({
      ...prev,
      products: [
        ...prev.products,
        {
          id: tempId("prd"),
          business_id: "",
          name: "",
          price: 0,
          stock: 0,
          sellable_via_whatsapp: true,
          is_active: true,
        },
      ],
    }));
  }, []);

  const updateRecordField = useCallback(
    (index: number, patch: Partial<RecordField>) => {
      setData((prev) => ({
        ...prev,
        recordFields: prev.recordFields.map((f, i) =>
          i === index ? { ...f, ...patch } : f,
        ),
      }));
    },
    [],
  );

  const removeRecordField = useCallback((index: number) => {
    setData((prev) => ({
      ...prev,
      recordFields: prev.recordFields.filter((_, i) => i !== index),
    }));
  }, []);

  const addRecordField = useCallback(() => {
    setData((prev) => ({
      ...prev,
      recordFields: [
        ...prev.recordFields,
        {
          _key: tempId("rf"),
          name: "",
          label: "",
          type: "text",
          required: false,
          ai_visible: true,
          ai_editable: true,
        },
      ],
    }));
  }, []);

  const updateAgent = useCallback((id: string, patch: Partial<Agent>) => {
    setData((prev) => ({
      ...prev,
      agents: prev.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }, []);

  const toggleAgentSkill = useCallback((agentId: string, skill: string) => {
    setData((prev) => ({
      ...prev,
      agents: prev.agents.map((a) => {
        if (a.id !== agentId) return a;
        return {
          ...a,
          skills: a.skills.includes(skill)
            ? a.skills.filter((s) => s !== skill)
            : [...a.skills, skill],
        };
      }),
    }));
  }, []);

  const setWhatsappConnected = useCallback(
    (phoneNumberId: string, wabaId: string) => {
      setData((prev) => ({
        ...prev,
        whatsappConnected: true,
        phoneNumberId,
        wabaId,
      }));
    },
    [],
  );

  const [activateError, setActivateError] = useState<string | null>(null);

  const activate = useCallback(async () => {
    setActivateError(null);
    try {
      // Persistir lo configurado en el wizard ANTES de marcar el onboarding como
      // completado: así un fallo deja el negocio re-activable.
      // ponytail: sin dedup — si un create falla a mitad y se reintenta puede
      // duplicar; aceptable para un flujo one-shot (anotar si molesta).
      await Promise.all([
        ...data.services.map((s) =>
          createService({
            name: s.name,
            duration_minutes: s.duration_minutes,
            price: s.price,
            is_active: s.is_active,
          }),
        ),
        ...data.products.map((p) =>
          createProduct({
            name: p.name,
            price: p.price,
            stock: p.stock,
            sellable_via_whatsapp: p.sellable_via_whatsapp,
            is_active: p.is_active,
          }),
        ),
        // `is_active` ⇔ enabled_agents; `autonomy` se guarda por agente.
        ...data.agents.map((a) =>
          apiUpdateAgent(a.type, { is_active: a.is_active, autonomy: a.autonomy }),
        ),
        ...(data.recordFields.length > 0
          ? [
              createRecordSchema(
                "Ficha de cliente",
                data.recordFields.map(
                  (f): RecordField => ({
                    name: f.name,
                    label: f.label,
                    type: f.type,
                    required: f.required,
                    ai_visible: f.ai_visible,
                    ai_editable: f.ai_editable,
                    ...(f.options ? { options: f.options } : {}),
                  }),
                ),
              ),
            ]
          : []),
      ]);

      await updateBusiness({
        name: data.businessName,
        country: data.country,
        currency: data.currency,
        language: data.language,
        timezone: data.timezone,
        is_active: true,
        onboarding_status: "completed",
      });
      setData((prev) => ({ ...prev, activated: true }));
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al activar el negocio.";
      setActivateError(message);
      throw err;
    }
  }, [data, router]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      data,
      currentStep,
      setCurrentStep,
      goNext,
      goBack,
      updateBusinessInfo,
      selectTemplate,
      updateService,
      removeService,
      addService,
      updateProduct,
      removeProduct,
      addProduct,
      updateRecordField,
      removeRecordField,
      addRecordField,
      updateAgent,
      toggleAgentSkill,
      setWhatsappConnected,
      activate,
      activateError,
      setActivateError,
    }),
    [
      data,
      currentStep,
      setCurrentStep,
      goNext,
      goBack,
      updateBusinessInfo,
      selectTemplate,
      updateService,
      removeService,
      addService,
      updateProduct,
      removeProduct,
      addProduct,
      updateRecordField,
      removeRecordField,
      addRecordField,
      updateAgent,
      toggleAgentSkill,
      setWhatsappConnected,
      activate,
      activateError,
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
    throw new Error(
      "useOnboarding debe usarse dentro de <OnboardingProvider>.",
    );
  }
  return ctx;
}
