/** Status of the business onboarding. */
export type OnboardingStatus = "not_started" | "in_progress" | "completed";

/** Tone the AI assistant responds with (mirrors the backend). */
export type AssistantTone = "formal" | "friendly" | "casual";

/** Configuration of the business's AI assistant. */
export interface AssistantConfig {
  /** Name the assistant introduces itself with to customers. */
  display_name: string;
  /** Tone of the responses. */
  tone: AssistantTone;
  /** Primary language of the responses (BCP-47, e.g. "es"). */
  language: string;
  /** Welcome message the assistant sends when starting a conversation. */
  welcome_message: string;
  /** Whether the assistant can operate autonomously without human supervision. */
  autonomous: boolean;
}

/** Business (tenant). Mirror of the backend's `Business` schema. */
export interface Business {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "CL"). */
  country: string;
  /** ISO 4217 currency code (e.g. "CLP"). */
  currency: string;
  /** Business language (BCP-47). */
  language: string;
  /** IANA time zone (e.g. "America/Santiago"). */
  timezone: string;
  is_active: boolean;
  onboarding_status: OnboardingStatus;
  assistant_config: AssistantConfig;
}

/** A step in the onboarding flow. */
export interface OnboardingStep {
  key: string;
  label: string;
  completed: boolean;
}

/** Detailed onboarding status (returned by `getOnboardingStatus`). */
export interface OnboardingState {
  status: OnboardingStatus;
  steps: OnboardingStep[];
}
