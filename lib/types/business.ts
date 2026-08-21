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
  /**
   * Scheduling policy — the documented exception to the voice-only surface
   * (product decision 2026-08-15): the customer may propose their own start time
   * (e.g. 10:20) as long as it falls inside opening hours and overlaps nothing.
   */
  flexible_scheduling: boolean;
  /** Minutes a service may END past closing (0 = it must end within hours).
   * Only meaningful with `flexible_scheduling` on. */
  closing_grace_minutes: number;
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
  /**
   * La plataforma apagó el negocio (suspendido/cancelado/desactivado). NO es
   * `!is_operative`: un trial en onboarding no es operativo pero tampoco está
   * bloqueado. Gobierna el overlay bloqueante (dueño) y el logout (staff),
   * espejo de la misma property que valida el login en el backend.
   */
  is_blocked: boolean;
  /** Whether a WhatsApp Business channel is connected. */
  whatsapp_connected: boolean;
  /** Display phone number of the connected channel ("" when not connected). */
  whatsapp_number: string;
  /**
   * What the contracted plan includes, computed by the backend. The panel reads
   * it and computes no plan logic of its own: the same object drives the API
   * guards, so a screen can never be hidden for a reason the API does not also
   * enforce. Read it with optional chaining — a cached bundle predating the
   * field must not throw.
   */
  entitlements: Entitlements;
  onboarding_status: OnboardingStatus;
  assistant_config: AssistantConfig;
  /** Sign-up instant (ISO 8601). Anchor of the reports' "en tus N días con yitopro". */
  created_at: string;
}

/** What the contracted plan grants. Mirrors the backend's `entitlements_for`. */
export interface Entitlements {
  /** The assistant AND WhatsApp — one capability, since no plan sells them apart. */
  assistant: boolean;
  agents: string[];
  /** 0 means no cap, the same convention the backend's `check_quota` reads. */
  max_professionals: number;
  max_users: number;
  plan_name: string;
  /**
   * «Sin plan = bloqueado» (2026-08-19): false blocks the whole dashboard —
   * the owner sees the choose-a-plan overlay, staff are logged out. Explicit
   * on purpose: a signal this load-bearing must not ride on plan_name === "".
   */
  has_plan: boolean;
  /** Current consumption, so the panel can say "usas X de N" without counting. */
  active_professionals: number;
  active_users: number;
  /** Agentes IA A LA VEZ («agenda O vende»); `agents` lleva la identidad. 0 = sin tope. */
  max_agents: number;
  /** Avisos pre-cita activos que el plan vende (Emprende 1, Crece/Escala 2). 0 = sin tope. */
  max_reminder_rules: number;
  /** «Los tiempos a tu medida» (Escala): si el PATCH de automatizaciones acepta timing. */
  can_edit_automation_timing: boolean;
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
