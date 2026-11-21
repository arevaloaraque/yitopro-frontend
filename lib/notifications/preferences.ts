/**
 * Preferencias de notificación que NO son de sonido.
 *
 * Vive aparte de `sound.ts` porque «mostrar avisos» no es una propiedad del audio, y en
 * localStorage por lo mismo que las de sonido: es la preferencia de la PERSONA frente a este
 * navegador, no un dato del negocio, así que no tiene endpoint.
 */

const TOASTS_KEY = "yitopro.notifications.toasts";

/** Suscriptores, para que React lea esto con `useSyncExternalStore` en vez de espejarlo. */
const listeners = new Set<() => void>();

export function subscribeNotificationPreferences(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // almacenamiento bloqueado (modo privado)
  }
}

/**
 * Por defecto SÍ se muestran: apagarlas es una decisión explícita.
 *
 * Se guarda el apagado (`"0"`) y no el encendido, así una clave ausente —o un localStorage
 * bloqueado— significa «mostrar», que es el comportamiento que no pierde información.
 */
export function areToastsEnabled(): boolean {
  return readStorage(TOASTS_KEY) !== "0";
}

export function setToastsEnabled(enabled: boolean): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(TOASTS_KEY, enabled ? "1" : "0");
    } catch {
      /* la preferencia simplemente no persiste */
    }
  }
  for (const listener of listeners) listener();
}
