/** Quién originó una acción: el agente de IA o un operador humano. */
export type ActorType = "ai" | "human";

/** Envelope de paginación de Django Ninja. */
export interface Paginated<T> {
  items: T[];
  count: number;
}
