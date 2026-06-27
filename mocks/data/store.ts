/**
 * Store en memoria del mock. Los handlers MSW leen y MUTAN estos arrays, de
 * modo que crear/editar/cancelar se refleje al navegar (no es solo lectura).
 *
 * Es un singleton de módulo: vive mientras viva la pestaña del navegador.
 */
import { createSeedData, type SeedData } from "./seed";

export const db: SeedData = createSeedData();

/** Reinicia el store al seed original (útil para tests). */
export function resetDb(): void {
  Object.assign(db, createSeedData());
}
