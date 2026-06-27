import { agentHandlers } from "./agents";
import { appointmentHandlers } from "./appointments";
import { businessHandlers } from "./businesses";
import { conversationHandlers } from "./conversations";
import { customerHandlers } from "./customers";
import { productHandlers } from "./products";
import { recordHandlers } from "./records";
import { serviceHandlers } from "./services";

/**
 * Registro mock-vs-real (F4-B). `true` = el dominio está conectado al backend
 * real: su handler MSW se EXCLUYE y las requests pasan a la red
 * (`onUnhandledRequest: "bypass"`). `false` = sigue mockeado por MSW.
 *
 * Estado actual:
 *  - services, products, customers, appointments, conversations → REAL.
 *  - businesses → mock: el backend no expone `assistant_config.display_name`
 *    ni `autonomous`, ni `GET /business/onboarding`. Ver README.
 *  - records → mock: `RecordOut` no incluye `schema` ni `audit`. Ver README.
 *  - agents → mock: no existe endpoint de agentes en el backend.
 *
 * Para conectar/desconectar un dominio: cambia su flag aquí. No hay que tocar
 * componentes ni `lib/api` (salvo que el shape real difiera, en cuyo caso el
 * mapeo vive en `lib/api/<dominio>.ts`).
 */
export const DOMAIN_LIVE = {
  businesses: false,
  services: true,
  products: true,
  customers: true,
  appointments: true,
  records: false,
  agents: false,
  conversations: true,
} as const;

const REGISTRY: Record<keyof typeof DOMAIN_LIVE, typeof businessHandlers> = {
  businesses: businessHandlers,
  services: serviceHandlers,
  products: productHandlers,
  customers: customerHandlers,
  appointments: appointmentHandlers,
  records: recordHandlers,
  agents: agentHandlers,
  conversations: conversationHandlers,
};

/** Handlers MSW activos: solo los de dominios todavía en mock. */
export const handlers = (Object.keys(REGISTRY) as (keyof typeof DOMAIN_LIVE)[]).flatMap(
  (domain) => (DOMAIN_LIVE[domain] ? [] : REGISTRY[domain]),
);
