import { api } from "./client";

/** Respuesta del callback de Embedded Signup (metadatos públicos de la WABA). */
export interface EmbeddedSignupResult {
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string;
}

/**
 * Envía el `code` corto del Embedded Signup de Meta al backend, que hace el
 * exchange/subscribe/persistencia del `ChannelAccount`. SOLO viaja el `code`:
 * ningún token de Meta llega ni sale por el cliente. El `business_id` lo deriva
 * el backend del access token (no del body).
 */
export function submitEmbeddedSignupCode(code: string): Promise<EmbeddedSignupResult> {
  return api.post<EmbeddedSignupResult>("/whatsapp/embedded-signup/callback/", {
    code,
  });
}
