import type {
  Agent,
  Professional,
  ScheduleWindow,
  Service,
  SystemUser,
} from "@/lib/types";

/** Step in the onboarding wizard (1-based). */
export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const TOTAL_STEPS = 8;

export const STEP_LABELS: Record<OnboardingStep, string> = {
  1: "Negocio",
  2: "Profesionales",
  3: "Horarios",
  4: "Servicios",
  5: "Usuarios",
  6: "WhatsApp",
  7: "Agentes",
  8: "Confirmar",
};

export interface OnboardingData {
  // Step 1 — Business details
  businessName: string;
  country: string;
  currency: string;
  language: string;
  timezone: string;

  // Step 2 — Professionals
  professionals: Professional[];

  // Step 3 — Business-wide weekly schedule (the default template).
  weeklySchedule: ScheduleWindow[];
  /** Optional per-professional schedule overrides, keyed by professional id. */
  professionalSchedules: Record<string, ScheduleWindow[]>;

  // Step 4 — Services
  services: Service[];

  // Step 5 — System users (owner/staff)
  users: SystemUser[];

  // Step 6 — WhatsApp (Embedded Signup real)
  whatsappConnected: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;
  whatsappNumber: string | null;

  // Step 7 — Agents (only the available ones, hydrated from GET /agents/).
  agents: Agent[];
}

export function createEmptyOnboardingData(): OnboardingData {
  return {
    businessName: "",
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
  };
}
