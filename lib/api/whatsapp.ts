import { api } from "./client";

/** Response from the Embedded Signup callback (public WABA metadata). */
export interface EmbeddedSignupResult {
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
