# Yitopro Frontend — Guía para Claude Code

Panel de administración SaaS de Yitopro. Negocios atienden clientes por WhatsApp con agentes de
IA; este repo es la interfaz operativa. Backend Django separado (repo `yitopro-backend`).

El desarrollo sigue `yitopro_frontend_execution_plan.md`, sesión por sesión. **El backend Django
real es la única fuente de datos.** No hay mocks en runtime: la UI siempre habla con el backend
(`NEXT_PUBLIC_API_URL`). MSW sobrevive solo en los tests.

## Stack

- Next.js App Router (v16, Turbopack) + TypeScript + React 19
- Tailwind CSS **v4** (tokens CSS-first vía `@theme` en `globals.css`, sin `tailwind.config`) + shadcn/ui (base: Base UI)
- MSW (Mock Service Worker) **solo en tests** (Node); no se carga en runtime
- `EventSource` nativo para SSE
- Fuente Inter
- Tests: Vitest/Jest + React Testing Library (desde F5)

## Comandos

```bash
npm run dev       # desarrollo (siempre contra el backend real en NEXT_PUBLIC_API_URL)
npm run build     # build de producción
npm run lint      # ESLint
npm run typecheck # tsc --noEmit
npm run format    # Prettier
npm run test      # tests (desde F5)
```

Después de cualquier cambio, antes de dar una tarea por terminada: `npm run lint` y
`npm run typecheck` deben pasar limpios.

## Reglas de arquitectura (no negociables)

1. **Capa de contrato — la UI nunca llama `fetch` directo.** Toda llamada de red pasa por
   `lib/api/*` (funciones tipadas). Los componentes consumen esas funciones, no HTTP.
2. **Tipos en `lib/types/`** reflejan los schemas del backend (Django Ninja). Una sola fuente de
   verdad. Si un shape no calza con el backend real, se ajusta el tipo/mapeo en `lib/api`,
   **nunca** en los componentes.
3. **Toda la red va al backend real** vía `NEXT_PUBLIC_API_URL`. No hay interceptación en runtime;
   si un shape no calza con el backend, se mapea en `lib/api/<dominio>.ts`, **nunca** en los
   componentes. (En tests, MSW intercepta estas mismas rutas — ver Testing.)
4. **`lib/sse` tiene una interfaz estable** (`subscribeToEvents`) sobre `fetch`+Bearer contra el
   stream real del backend. Cambia la implementación interna, nunca la firma pública.
5. **Suscripción SSE una sola vez**, a nivel del layout autenticado — no por pantalla.

## Reglas de diseño visual (no negociables)

- **Estilo:** SaaS moderno y limpio (referencia Linear/Vercel). Espacio en blanco, bordes
  sutiles, sombras suaves.
- **Tokens, nunca hex literales.** Los componentes usan `bg-primary`, `text-foreground`, etc.
  Prohibido escribir `#6D35F2` en un componente.
- **Paleta de marca** (definida como tokens CSS en `globals.css`: `:root`/`.dark` + bloque `@theme inline`):
  | Token | Hex | Uso |
  |-------|-----|-----|
  | `primary` | `#6D35F2` | navegación activa, botones primarios, marca |
  | `accent` | `#FF7A1A` | IA trabajando, estados activos, alertas |
  | `foreground` | `#071A3A` | texto principal, base del dark |
  | `background` | `#FFFFFF` | fondos / superficies claras |
- **Modo claro primero.** Los tokens dark existen desde F1; el toggle se completa en F5. El dark
  usa los mismos tokens, no colores nuevos.
- **Layout:** sidebar izquierdo fijo (isotipo colapsado / logo horizontal expandido) + topbar con
  estado del asistente y notificaciones.
- **Estados reutilizables:** usar `components/states/` (`<Loading>`, `<EmptyState>`, `<ErrorState>`).
  Toda pantalla con datos tiene loading/empty/error. No reinventarlos por pantalla.
- Reusar componentes de shadcn y los formularios/tablas existentes; no duplicar.

## Reglas de seguridad (no negociables)

- **Access token JWE vive solo en memoria** (estado React). Prohibido `localStorage`/`sessionStorage`.
- **Refresh token** es cookie httpOnly que maneja el browser; no se toca desde JS. Las requests
  usan `credentials: 'include'`.
- **No decodificar el access token** en el cliente: es opaco por diseño.
- Ante `401`, intentar refresh una vez y reintentar; si falla, limpiar sesión y redirigir a `/login`.
  **Implementado (F4-A):** login/refresh/logout reales (`lib/api/auth.ts`), interceptor single-flight
  en `lib/api/client.ts`. **Recargar la página fuerza re-login** (token solo en memoria; no se
  recupera vía cookie en boot frío). El backend debe permitir CORS con credenciales (ver README).
- **Sanitizar** todo contenido externo que se renderice (mensajes de WhatsApp de clientes).
- Solo `NEXT_PUBLIC_*` son públicos; **ningún secreto en el bundle**. `META_APP_SECRET` jamás
  llega al cliente; en Embedded Signup solo el `code` corto viaja al backend.
- El frontend no toma decisiones de seguridad ni de aislamiento multi-tenant; eso lo valida el backend.

## Estructura del proyecto

```
app/                  # rutas (App Router): login, (app)/dashboard, conversations, appointments,
                      #   services, products, customers, records, agents, settings, onboarding, _design
components/           # UI: ui/ (shadcn), states/ (loading/empty/error), y componentes compartidos
lib/
  types/              # tipos de dominio (reflejo del backend)
  api/                # client.ts + servicios tipados por dominio (única capa de red)
  sse/                # abstracción de eventos en tiempo real (interfaz estable)
  auth/               # AuthContext, useAuth, login/refresh/logout
mocks/
  server.ts           # setupServer() de MSW para tests (Node); sin handlers por defecto
```

## Caso de dominio para tests

Caso **PET Spa** (peluquería/veterinaria canina): negocio PET Spa, servicios Baño/Corte/Baño+Corte,
clientes con mascotas, fichas con `pet_name`/`species`/`weight_kg`/`vet_notes`, conversaciones de
WhatsApp realistas. Es el escenario de referencia al escribir tests para que la validación se
sienta real.

## Variables de entorno

```
NEXT_PUBLIC_API_URL=http://localhost:8050   # backend Django (puerto API_PORT=8050; ver yitopro-backend)
NEXT_PUBLIC_META_APP_ID=                     # WhatsApp Embedded Signup (F4-C)
NEXT_PUBLIC_META_CONFIG_ID=                  # configuration_id de Embedded Signup (F4-C)
```

> El backend escucha en **8050** (no 8000). Si el front recibe `ERR_CONNECTION_REFUSED`, casi
> siempre es `NEXT_PUBLIC_API_URL` apuntando al puerto equivocado o el backend caído.

**Dominios contra el backend real:** auth, services, products, customers, appointments,
conversations (inbox + tomar/cerrar/reactivar/responder), **SSE** (`lib/sse` lee
`GET /api/events/stream/` por `fetch`+Bearer, no `EventSource`, porque el token va por header) y
**WhatsApp Embedded Signup** (`POST /api/whatsapp/embedded-signup/callback/`, solo viaja el `code`).
Los desajustes de shape se mapean en `lib/api/<dominio>.ts`, nunca en componentes. Ver README.

**Endurecimiento (F5):**
- **Errores**: `lib/errors.ts` (mensajes seguros por código HTTP, sin stack traces) + boundaries
  `app/error.tsx` / `global-error.tsx` / `not-found.tsx`, todos reusando `ErrorState`.
- **Dark mode**: `next-themes` en `app/providers.tsx` (`attribute="class"`), toggle en el topbar;
  tokens claro/oscuro en `globals.css` (base Navy), sin colores nuevos.
- **Testing**: Vitest + RTL + MSW (node) — `npm run test`, ningún test toca el backend real
  (`mocks/server.ts`). **Forms**: RHF + Zod con esquemas en `lib/validation/schemas.ts` (login
  convertido; resto pendiente de migrar — ver README).
- **CI**: `.github/workflows/ci.yml` (install→lint→typecheck→test→build). **Deploy**: `vercel.json`
  + `.env.production.example`; en prod `NEXT_PUBLIC_API_URL` apunta al backend desplegado.
- Antes de cerrar cualquier tarea: `npm run lint`, `npm run typecheck`, `npm run test` y
  `npm run build` deben pasar limpios.

## Flujo de trabajo por sesión

1. Cada sesión del plan es independiente y trae todo su contexto.
2. No avanzar a la siguiente sesión si la actual quedó incompleta.
3. Respetar los **checkpoints** (fin de F2-E y F3-C): son validación humana de la UI antes de seguir.
4. Commit al cerrar cada sesión:
   ```bash
   git add . && git commit -m "sesión F1-A: proyecto base + fundación de diseño"
   ```

## Qué NO hacer

- No llamar `fetch` desde componentes.
- No escribir hex literales en componentes (solo tokens).
- No persistir el access token fuera de memoria.
- No reintroducir mocks en runtime ni leer `NEXT_PUBLIC_API_MOCKING` (variable eliminada). MSW es
  solo de tests.
- No mapear desajustes de shape en componentes; hacerlo en `lib/api/<dominio>.ts`.
