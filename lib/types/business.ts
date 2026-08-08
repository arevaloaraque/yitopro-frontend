/** Status of the business onboarding. */
type OnboardingStatus = "not_started" | "in_progress" | "completed";

/** Tone the AI assistant responds with (mirrors the backend). */
export type AssistantTone = "formal" | "friendly" | "casual";

/** Configuration of the business's AI assistant. */
interface AssistantConfig {
  /** Name the assistant introduces itself with to customers. */
  display_name: string;
  /** Tone of the responses. */
  tone: AssistantTone;
  // The assistant's response language is inherited from the business language
  // (`Business.language`); it is not configured separately.
  /** Welcome message the assistant sends when starting a conversation. */
  welcome_message: string;
}

/**
 * The business's own voice: every message its customers read, plus the context the
 * assistant answers from. Mirror of the backend's `BusinessConfigUpdateIn` — which
 * is deliberately narrower than the config row: what decides how the assistant
 * BEHAVES (model, confirmation templates, the identity reply, plan entitlements)
 * stays with Yitopro staff.
 *
 * Every message may be empty, and empty is meaningful: the backend falls back to a
 * per-language default, so a blank field is "use the standard text", never silence.
 */
export interface BusinessConfig {
  tone: AssistantTone;
  /** First contact. */
  welcome_message: string;
  /** When the assistant cannot resolve the request. */
  fallback_message: string;
  /** Outside opening hours: the notice, and the follow-up acknowledgement. */
  out_of_hours_message: string;
  out_of_hours_ack_message: string;
  /** When the conversation is handed to a person. */
  human_handoff_message: string;
  /** While the customer waits for the operator. */
  handoff_waiting_ack_message: string;
  /** When the assistant takes the conversation back after operator silence. */
  handoff_timeout_revert_message: string;
  /** When the request is outside what the business does. */
  off_topic_message: string;
  /** Shown as "Sobre tu negocio": what they offer and what customers keep asking. */
  business_context: string;
}

/** Business (tenant). Mirror of the backend's `Business` schema. */
export interface Business {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "CL"). */
  country: string;
  /** Store street address shown to customers by the AI ("" when not set). */
  address: string;
  /** ISO 4217 currency code (e.g. "CLP"). */
  currency: string;
  /** Business language (BCP-47). */
  language: string;
  /** IANA time zone (e.g. "America/Santiago"). */
  timezone: string;
  is_active: boolean;
  /** Whether the assistant is live and answering customers (active AND status==="active"). */
  is_operative: boolean;
  /** Whether a WhatsApp Business channel is connected. */
  whatsapp_connected: boolean;
  /** Display phone number of the connected channel ("" when not connected). */
  whatsapp_number: string;
  onboarding_status: OnboardingStatus;
  assistant_config: AssistantConfig;
}

/** A step in the onboarding flow. */
interface OnboardingStep {
  key: string;
  label: string;
  completed: boolean;
}

/** Detailed onboarding status (returned by `getOnboardingStatus`). */
export interface OnboardingState {
  status: OnboardingStatus;
  steps: OnboardingStep[];
}
