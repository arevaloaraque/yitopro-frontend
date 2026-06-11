import { agentHandlers } from "./agents";
import { appointmentHandlers } from "./appointments";
import { businessHandlers } from "./businesses";
import { conversationHandlers } from "./conversations";
import { customerHandlers } from "./customers";
import { productHandlers } from "./products";
import { recordHandlers } from "./records";
import { serviceHandlers } from "./services";

/** Todos los handlers MSW. Mismas rutas que consume `lib/api`. */
export const handlers = [
  ...businessHandlers,
  ...serviceHandlers,
  ...appointmentHandlers,
  ...customerHandlers,
  ...recordHandlers,
  ...productHandlers,
  ...conversationHandlers,
  ...agentHandlers,
];
