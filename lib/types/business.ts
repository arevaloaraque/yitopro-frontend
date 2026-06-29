/** Estado del onboarding del negocio. */
export type OnboardingStatus = "not_started" | "in_progress" | "completed";

/** Tono con el que responde el asistente de IA (refleja el backend). */
export type AssistantTone = "formal" | "friendly" | "casual";

/** Configuración del asistente de IA del negocio. */
export interface AssistantConfig {
  /** Nombre con el que el asistente se presenta a los clientes. */
  display_name: string;
  /** Tono de las respuestas. */
  tone: AssistantTone;
  /** Idioma principal de las respuestas (BCP-47, p.ej. "es"). */
  language: string;
  /** Mensaje de bienvenida que envía el asistente al iniciar una conversación. */
  welcome_message: string;
  /** Si el asistente puede operar de forma autónoma sin supervisión humana. */
  autonomous: boolean;
}

/** Negocio (tenant). Reflejo del schema `Business` del backend. */
export interface Business {
  id: string;
  name: string;
  /** Código de país ISO 3166-1 alfa-2 (p.ej. "CL"). */
  country: string;
  /** Código de moneda ISO 4217 (p.ej. "CLP"). */
  currency: string;
  /** Idioma del negocio (BCP-47). */
  language: string;
  /** Zona horaria IANA (p.ej. "America/Santiago"). */
  timezone: string;
  is_active: boolean;
  onboarding_status: OnboardingStatus;
  assistant_config: AssistantConfig;
}

/** Un paso del flujo de onboarding. */
export interface OnboardingStep {
  key: string;
  label: string;
  completed: boolean;
}

/** Estado detallado del onboarding (devuelto por `getOnboardingStatus`). */
export interface OnboardingState {
  status: OnboardingStatus;
  steps: OnboardingStep[];
}
