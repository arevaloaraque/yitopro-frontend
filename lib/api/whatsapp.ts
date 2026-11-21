import { api } from "./client";

/** Response from the Embedded Signup callback (public WABA metadata). */
interface EmbeddedSignupResult {
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string;
}

/**
 * Sends the short Embedded Signup `code` from Meta to the backend, which does
 * the exchange/subscribe/persistence of the `ChannelAccount`. ONLY the `code`
 * travels: no Meta token enters or leaves through the client. The backend
 * derives the `business_id` from the access token (not from the body).
 */
export function submitEmbeddedSignupCode(code: string): Promise<EmbeddedSignupResult> {
  return api.post<EmbeddedSignupResult>("/whatsapp/embedded-signup/callback/", {
    code,
  });
}

/** A WhatsApp message template as known by the backend (mirrors Meta's approval status). */
export interface WhatsAppTemplate {
  name: string;
  language: string;
  category: string;
  status: "approved" | "pending" | "rejected";
  catalog_key: string;
}

/**
 * Lists the business's WhatsApp templates. `synced` is `false` when the
 * best-effort refresh against Meta failed (or there's no channel yet); the
 * local rows are returned either way.
 */
export function listTemplates(): Promise<{
  items: WhatsAppTemplate[];
  synced: boolean;
}> {
  return api.get<{ items: WhatsAppTemplate[]; synced: boolean }>(
    "/whatsapp/templates/",
  );
}
