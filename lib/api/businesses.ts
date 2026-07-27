import type {
  Business,
  BusinessConfig,
  OnboardingState,
  ScheduleBlock,
  ScheduleWindow,
} from "@/lib/types";

import { api, ApiError } from "./client";

/**
 * The backend exposes the business at `/businesses/me/` with some extra fields
 * and `active`/`id:int`. We map here (contract layer) so components keep
 * consuming the stable `Business` type, without touching the UI.
 */
interface BackendBusiness {
  id: number;
  name: string;
  country: string;
  address: string;
  currency: string;
  language: string;
  timezone: string;
  active: boolean;
  is_operative: boolean;
  whatsapp_connected: boolean;
  whatsapp_number: string;
  onboarding_status: Business["onboarding_status"];
  assistant_config: Business["assistant_config"];
}

function toBusiness(b: BackendBusiness): Business {
  return {
    id: String(b.id),
    name: b.name,
    country: b.country,
    address: b.address,
    currency: b.currency,
    language: b.language,
    timezone: b.timezone,
    is_active: b.active,
    is_operative: b.is_operative,
    whatsapp_connected: b.whatsapp_connected,
    whatsapp_number: b.whatsapp_number,
    onboarding_status: b.onboarding_status,
    assistant_config: b.assistant_config,
  };
}

/** Current tenant's business. */
export async function getBusiness(): Promise<Business> {
  return toBusiness(await api.get<BackendBusiness>("/businesses/me/"));
}

/**
 * Updates the writable business fields (including the nested `assistant_config`).
 * The param mirrors the backend `BusinessUpdateIn`: server-owned fields
 * (`is_active`, `is_operative`, `whatsapp_*`, `onboarding_status`) are not
 * accepted and are intentionally excluded from the type.
 */
export async function updateBusiness(
  patch: Partial<
    Pick<
      Business,
      | "name"
      | "country"
      | "address"
      | "currency"
      | "language"
      | "timezone"
      | "assistant_config"
    >
  >,
): Promise<Business> {
  return toBusiness(await api.patch<BackendBusiness>("/businesses/me/", patch));
}

/**
 * The business's voice — every message its customers read.
 *
 * A separate endpoint from `PATCH /businesses/me/`: the config row lives on
 * `BusinessConfig`, and the backend exposes a deliberately narrow slice of it here.
 * `display_name` is NOT part of it (it is not in the backend's config schema) — that
 * one still travels in the nested `assistant_config` of `updateBusiness`.
 *
 * The wire shape is already flat snake_case, so there is no mapper to write.
 */
export function getBusinessConfig(): Promise<BusinessConfig> {
  return api.get<BusinessConfig>("/businesses/me/config/");
}

export function updateBusinessConfig(
  patch: Partial<BusinessConfig>,
): Promise<BusinessConfig> {
  return api.patch<BusinessConfig>("/businesses/me/config/", patch);
}

/** Detailed onboarding status (the backend already returns the exact shape). */
export function getOnboardingStatus(): Promise<OnboardingState> {
  return api.get<OnboardingState>("/businesses/me/onboarding/");
}

/**
 * Replaces the business-wide default schedule with the given windows.
 * Returns how many professionals were updated with the new defaults.
 */
export function putBusinessSchedule(
  windows: ScheduleWindow[],
): Promise<{ professionals_updated: number }> {
  return api.put<{ professionals_updated: number }>(
    "/businesses/me/schedule/",
    windows,
  );
}

/** Fetches the current business-wide default schedule. */
export async function getBusinessSchedule(): Promise<ScheduleWindow[]> {
  return toHmWindows(await api.get<ScheduleWindow[]>("/businesses/me/schedule/"));
}

/** Normalizes backend "HH:MM:SS" times to the "HH:MM" the time inputs use. */
export function toHmWindows(windows: ScheduleWindow[]): ScheduleWindow[] {
  return windows.map((w) => ({
    day_of_week: w.day_of_week,
    start_time: w.start_time.slice(0, 5),
    end_time: w.end_time.slice(0, 5),
  }));
}

/**
 * Business opening hours (drives the AI out-of-hours gate and bounds the
 * agenda). Empty = unset → always open / no clipping. Separate from the
 * per-professional schedule (`getBusinessSchedule`/`putBusinessSchedule`).
 */
export async function getBusinessHours(): Promise<ScheduleWindow[]> {
  return toHmWindows(await api.get<ScheduleWindow[]>("/businesses/me/business-hours/"));
}

/** Replaces the business opening hours; returns the saved windows. */
export async function putBusinessHours(
  windows: ScheduleWindow[],
): Promise<ScheduleWindow[]> {
  return toHmWindows(
    await api.put<ScheduleWindow[]>("/businesses/me/business-hours/", windows),
  );
}

interface BackendScheduleBlock {
  id: number;
  professional_id: number | null;
  professional_name: string;
  start_datetime: string;
  end_datetime: string;
  reason: string;
}

function blockFromBackend(b: BackendScheduleBlock): ScheduleBlock {
  return {
    id: String(b.id),
    professional_id: b.professional_id === null ? null : String(b.professional_id),
    professional_name: b.professional_name,
    start_datetime: b.start_datetime,
    end_datetime: b.end_datetime,
    reason: b.reason,
  };
}

/**
 * Manual time blocks that remove availability (vacations, closures). A block
 * with `professional_id: null` closes the whole business. Ordered soonest first.
 */
export async function getScheduleBlocks(): Promise<ScheduleBlock[]> {
  const res = await api.get<BackendScheduleBlock[]>("/businesses/me/schedule-blocks/");
  return res.map(blockFromBackend);
}

/** Creates a block; `professional_id: null` = whole business. Datetimes are ISO 8601. */
export async function createScheduleBlock(input: {
  professional_id: string | null;
  start_datetime: string;
  end_datetime: string;
  reason?: string;
}): Promise<ScheduleBlock> {
  const body = {
    professional_id:
      input.professional_id === null ? null : Number(input.professional_id),
    start_datetime: input.start_datetime,
    end_datetime: input.end_datetime,
    reason: input.reason ?? "",
  };
  return blockFromBackend(
    await api.post<BackendScheduleBlock>("/businesses/me/schedule-blocks/", body),
  );
}

/** Removes a block. */
export function deleteScheduleBlock(id: string): Promise<void> {
  return api.delete<void>(`/businesses/me/schedule-blocks/${id}/`);
}

/**
 * Marks the onboarding flow as complete.
 * - 200: returns `{ ok: true }`.
 * - 400: catches `ApiError` and returns `{ ok: false, missing_steps }`.
 * - Any other error is re-thrown.
 */
export async function completeOnboarding(): Promise<{
  ok: boolean;
  missing_steps?: string[];
}> {
  try {
    await api.post("/businesses/me/onboarding/complete/");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      const body = err.body as { missing_steps?: string[] } | null;
      return { ok: false, missing_steps: body?.missing_steps ?? [] };
    }
    throw err;
  }
}
