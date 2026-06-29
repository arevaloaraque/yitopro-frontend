import type { Agent, Product, RecordField, Service } from "@/lib/types";
import type { IndustryTemplate } from "./templates";

export interface RecordFieldWithKey extends RecordField {
  _key: string;
}

export type OnboardingStep =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9;

export const TOTAL_STEPS = 9;

export const STEP_LABELS: Record<OnboardingStep, string> = {
  1: "Negocio",
  2: "Industria",
  3: "Servicios",
  4: "Productos",
  5: "Fichas",
  6: "Agentes",
  7: "WhatsApp",
  8: "Prueba",
  9: "Activación",
};

export interface OnboardingData {
  // Step 1 — Business details
  businessName: string;
  country: string;
  currency: string;
  language: string;
  timezone: string;

  // Step 2 — Template
  selectedTemplate: IndustryTemplate | null;

  // Step 3 — Editable services
  services: Service[];

  // Step 4 — Editable products
  products: Product[];

  // Step 5 — Editable record fields
  recordFields: RecordFieldWithKey[];

  // Step 6 — Editable agents
  agents: Agent[];

  // Step 7 — WhatsApp (Embedded Signup real)
  whatsappConnected: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;

  // Step 9
  activated: boolean;
}

export function createEmptyOnboardingData(): OnboardingData {
  return {
    businessName: "",
    country: "CL",
    currency: "CLP",
    language: "es",
    timezone: "America/Santiago",
    selectedTemplate: null,
    services: [],
    products: [],
    recordFields: [],
    agents: [],
    whatsappConnected: false,
    phoneNumberId: null,
    wabaId: null,
    activated: false,
  };
}
