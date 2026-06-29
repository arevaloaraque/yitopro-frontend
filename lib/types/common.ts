/** Who originated an action: the AI agent or a human operator. */
export type ActorType = "ai" | "human";

/** Django Ninja pagination envelope. */
export interface Paginated<T> {
  items: T[];
  count: number;
}
