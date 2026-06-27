import { agentHandlers } from "./agents";
import { businessHandlers } from "./businesses";
import { recordHandlers } from "./records";

/**
 * Handlers MSW de los dominios que SIGUEN mockeados porque el backend aún no
 * expone su shape/endpoint completo:
 *  - businesses/settings: falta `assistant_config.display_name`/`autonomous` y `/business/onboarding`.
 *  - records (fichas): `RecordOut` no incluye `schema` ni `audit`.
 *  - agents: no existe endpoint de agentes en el backend.
 *
 * Todo lo demás (auth, services, products, customers, appointments, conversations,
 * SSE) va al backend real. Cuando el backend exponga uno de estos dominios, se
 * borra su handler aquí (y se quita su data del seed).
 */
export const handlers = [...businessHandlers, ...recordHandlers, ...agentHandlers];
