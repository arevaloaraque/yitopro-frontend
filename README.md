# Yitopro Frontend

Panel de administración SaaS de Yitopro (Next.js App Router). Backend Django separado
(`yitopro-backend`). Ver `CLAUDE.md` para la guía de arquitectura y el plan de ejecución.

## Requisitos

- Node **≥ 24** (ver `.nvmrc`). El CLI de MSW necesita Node 22+.
- Para usar auth, el backend Django corriendo (por defecto en `http://localhost:8050`).

## Puesta en marcha

```bash
nvm use                              # Node 24
npm install --legacy-peer-deps       # ver nota abajo
cp .env.example .env.local           # ajusta si tu backend no está en :8050
npx msw init public                  # genera public/mockServiceWorker.js (gitignored, requerido)
npm run dev                          # http://localhost:3000
```

> **`--legacy-peer-deps`**: `@testing-library/react` aún declara un peer de React más
> estricto que el 19 del proyecto. La resolución real es correcta; el flag solo evita el
> error de peers de npm. Vercel y CI usan el mismo flag (ver `vercel.json` / `.github`).

> `public/mockServiceWorker.js` está en `.gitignore` y **no** se versiona: cada clon debe
> generarlo con `npx msw init public`. Sin él, MSW no arranca y las rutas mockeadas fallan.

## Variables de entorno

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8050` | Origen del backend Django. El navegador llama directo aquí. |
| `NEXT_PUBLIC_API_MOCKING` | `enabled` | `enabled`: MSW intercepta solo los dominios aún mockeados (businesses, records, agents). `disabled`: toda la red va al backend real. (SSE y auth son siempre reales.) |
| `NEXT_PUBLIC_META_APP_ID` / `NEXT_PUBLIC_META_CONFIG_ID` | — | WhatsApp Embedded Signup (F4-C). Vacíos ⇒ el paso 7 muestra aviso de configuración. |

## Autenticación (conectada — F4-A)

El login es **real** contra el backend; el resto de dominios sigue mockeado por MSW.

- **`POST /api/auth/login/`** (`{ email, password }`) → `{ access_token, expires_in, token_type }`.
  - El **access token (JWE opaco)** vive **solo en memoria** (estado de `AuthContext`). Nunca en
    `localStorage`/`sessionStorage`, y **no se decodifica** en el cliente (es cifrado por diseño).
  - El **refresh token** llega como cookie **httpOnly** `yitopro_refresh` (scope `/api/auth/`),
    que JS no puede leer. Las requests usan `credentials: "include"`.
- **Refresh automático ante 401:** `lib/api/client.ts` intercepta cualquier `401`, llama una vez a
  `POST /api/auth/refresh/` (single-flight: un solo refresh aunque haya N requests en paralelo) y
  reintenta la request original con el token nuevo. Si el refresh falla, limpia la sesión y
  `RequireAuth` redirige a `/login`. Las rutas de auth se saltan este interceptor (`skipRefresh`)
  para no recursar.
- **Logout:** `POST /api/auth/logout/` (revoca la cookie en el backend, best-effort) + limpia el
  estado local.
- **Identidad visible:** el backend no devuelve perfil en el login, así que el nombre/email del
  topbar se arman con el email del formulario. No se llama a `/api/auth/me/`.

### Comportamiento al recargar la página

**Recargar fuerza re-login.** El access token solo vive en memoria, así que un refresh de página
lo pierde y `RequireAuth` redirige a `/login`. No se recupera la sesión automáticamente vía la
cookie de refresh: es la opción más simple y segura, y el backend no expone el email para
reconstruir la identidad tras un boot en frío. El refresh silencioso sí opera **durante** una
sesión activa (cuando el access token expira a mitad de uso).

## CORS y cookies (backend)

El frontend (`:3000`) y el backend (`:8050`) comparten *site* (`localhost`) pero distinto *origin*
(puerto), así que el navegador exige CORS para `fetch`. El backend debe permitir el origen del
frontend **con credenciales**. En `yitopro-backend` esto ya está configurado con
`django-cors-headers`:

```python
# config/settings/base.py
INSTALLED_APPS = [..., "corsheaders", ...]
MIDDLEWARE = ["...SecurityMiddleware", "corsheaders.middleware.CorsMiddleware", ...]
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())
CORS_ALLOW_CREDENTIALS = True   # echa el origen exacto (nunca "*") + Allow-Credentials: true

# config/settings/local.py
CORS_ALLOWED_ORIGINS = ["http://localhost:3000"]
```

- Con `CORS_ALLOW_CREDENTIALS=True`, `django-cors-headers` responde con el **origen exacto** (no
  `*`), requisito del navegador para enviar/recibir cookies cross-origin.
- La cookie de refresh es `SameSite=Lax`; como `:3000`↔`:8050` son *same-site* (el puerto no cuenta
  para el "site"), el navegador la envía en el `fetch` a `/api/auth/*`.
- En producción frontend y backend son **same-origin** (`app.yitopro.com`), así que `CORS_ALLOWED_ORIGINS`
  queda vacío allí.

## Conexión al backend por dominio (F4-B/F4-C)

Los dominios conectados van al backend real (sus handlers MSW fueron eliminados). En
`mocks/handlers/index.ts` solo quedan los handlers de los dominios aún mockeados
(businesses/settings, records, agents); el resto pasa a la red real (`onUnhandledRequest:
"bypass"`). Solo se tocó la capa `lib/api`/tipos para mapear desajustes de shape —
**ningún componente cambió**. Cuando el backend exponga un dominio mockeado, se borra su handler.

| Dominio | Estado | Notas |
|---------|--------|-------|
| auth | **real** | F4-A |
| services | **real** | mapeo: `active`→`is_active`, `price` Decimal-string→number, `id` int→string, sin envelope de paginación (lista cruda) |
| products | **real** | mapeo: `whatsapp_enabled`→`sellable_via_whatsapp`, `active`→`is_active`, `price`/`id` |
| customers | **real** | mapeo: `display_name`→`name`; `create` envía `{phone, display_name}` |
| appointments | **real** | mapeo: `start`/`end`→`start_datetime`; reagendar usa `new_start_datetime` (el backend recalcula el fin); cancelar/reagendar son `PATCH`; `origin`→`created_by`; filtro por `date` (no `from`/`to`) |
| **tiempo real (SSE)** | **real** (F4-C) | `lib/sse` lee `GET /api/events/stream/` por `fetch` (ver abajo) |
| **WhatsApp Embedded Signup** | **real** (F4-C) | `POST /api/whatsapp/embedded-signup/callback/`; requiere `NEXT_PUBLIC_META_*` (ver abajo) |
| **conversations** | **real** (F4-C) | inbox + acciones reales. Mapeo: `id` int→string, `customer` anidado→`customer_id`, status `assigned_to_human`→`human_handoff` / `open`/`waiting_*`→`ai_active`, `direction` `in`/`out`→`inbound`/`outbound`; `responder` envía `{content}`. El backend no expone `detected_intent`/`unread` (→ `null`/`0`, el SSE incrementa `unread` en vivo) ni `sender` por mensaje (salientes se asumen `ai` al listar; `human` al responder). **Responder** exige tomar la conversación primero (403 si no) y entrega de verdad por WhatsApp (409 si el contacto no es una cuenta WhatsApp real). |
| **businesses / settings** | mock | el backend no expone `assistant_config.display_name` ni `autonomous` (solo `tone`/`welcome_message`/`language` en `BusinessConfig`, y `tone` usa `friendly` no `neutral`), ni `GET /business/onboarding`. |
| **records (fichas)** | mock | `RecordOut` no incluye `schema` (definición de campos) ni `audit`; el formulario dinámico los necesita. |
| **agents** | mock | el backend no tiene endpoint de agentes (`apps/agents` es un esqueleto vacío). |

**Gaps de mapeo con caveat conocido:**
- `getAppointmentHistory` devuelve `[]`: el backend aún no tiene endpoint/modelo de auditoría de citas.
- El estado de cita `no_show` del backend no tiene equivalente en la UI (no hay badge); `rescheduled`
  no existe en el backend (reagendar mantiene `scheduled`).

El backend corre en Docker (`http://localhost:8050`); las listas devuelven arrays crudos (sin
`{items,count}`), los IDs son enteros y los precios `Decimal` serializados como string — todo eso
se normaliza en `lib/api/<dominio>.ts`.

## Tiempo real — SSE (F4-C)

`lib/sse` expone `subscribeToEvents(handler)` (firma estable; multiplexa un único stream a todos los
suscriptores: dashboard, agenda, conversaciones, notificaciones). La implementación interna ahora es
**SSE real** contra `GET /api/events/stream/`:

- **Por qué `fetch` y no `EventSource`:** el backend autentica el stream por header
  `Authorization: Bearer` y el access token vive solo en memoria. `EventSource` nativo no puede
  enviar headers (solo cookies) y la cookie de refresh está acotada a `/api/auth/`. Por eso el
  stream se lee con `fetch` + `ReadableStream`, con **reconexión con backoff** y **refresh de token**
  ante `401` propios (un `401` del stream no cierra sesión: eso lo gobiernan las llamadas API).
- **Mapeo de envelope:** el backend emite frames `data: {"event","data","correlation_id"}`. Se
  traduce al `SSEEvent` del front `{id, type, emitted_at, data}`: `event`→`type`, se sintetizan
  `id` (dedupe) y `emitted_at` (no los manda el backend), y en `data` se coaccionan ids enteros a
  string y `start_datetime`→`start` / `slot`→`new_start`.
- El emisor de eventos **simulados** (mock) quedó **apagado**.

## WhatsApp Embedded Signup (F4-C)

Paso 7 del onboarding (`step-7-whatsapp.tsx`): carga el JS SDK de Meta, hace `FB.init` con
`NEXT_PUBLIC_META_APP_ID` y lanza `FB.login` con `NEXT_PUBLIC_META_CONFIG_ID` (`response_type:
"code"`). Del navegador **solo viaja el `code` corto** a `POST /api/whatsapp/embedded-signup/callback/`;
el backend hace el exchange/subscribe y persiste el `ChannelAccount`. **Ningún token de Meta toca el
cliente.** Si `NEXT_PUBLIC_META_*` están vacíos, el paso muestra un aviso de configuración en vez del
botón.

Validado con credenciales reales: `FB.init` + `FB.login(config_id)` abren el popup oficial de
Embedded Signup de Meta (sin error de dominio), y el callback responde correcto ante un `code`
inválido. Completar el flujo (login de Meta + selección de WABA → `code` real → registro del
`ChannelAccount`) es un paso humano. Nota de flujo: el paso 7 vive tras `RequireAuth` y solo se
alcanza vía el onboarding (al recargar se pierde el token en memoria, por diseño F4-A).

## MSW en producción

MSW solo arranca si `NEXT_PUBLIC_API_MOCKING=enabled` (ver `app/providers.tsx`); en producción
(`disabled`) no se carga y toda la red va al backend real. Con MSW apagado funcionan los dominios
ya conectados (auth, services, products, customers, appointments, conversations, SSE, Embedded
Signup). Los que siguen en mock (businesses/settings, records, agents) requieren que el backend
exponga sus shapes/endpoints antes de poder operar 100% sin mock.

## Comandos

```bash
npm run dev        # desarrollo
npm run build      # build de producción
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run test       # Vitest (run) — sin backend real
npm run test:watch # Vitest en watch
npm run format     # Prettier
```

## Manejo de errores (F5)

Sistema unificado, sin exponer stack traces ni mensajes técnicos:

- `lib/errors.ts` — `friendlyMessage(error)` / `messageForStatus(status)` / `titleForStatus(status)`:
  traducen cualquier error (incluido `ApiError`) a textos seguros en español por código HTTP
  (401/403/404/409/500/red).
- **Boundaries de ruta**: `app/error.tsx` (excepciones no manejadas; mapea `ApiError.status` a
  un mensaje seguro + `reset()`), `app/global-error.tsx` (crash de raíz, autocontenido) y
  `app/not-found.tsx` (404). Todos reutilizan el **mismo** componente visual `ErrorState`.
- En pantallas, los errores de carga usan `components/states/ErrorState` con `onRetry`; el `401`
  lo intercepta `lib/api/client` (refresh + redirect a `/login`).

## Modo oscuro (F5)

- Tokens claro/oscuro en `app/globals.css` (base Navy `#071A3A`); el dark **reutiliza** los mismos
  tokens, sin colores nuevos.
- `next-themes` montado en `app/providers.tsx` (`attribute="class"`, `defaultTheme="system"`,
  `enableSystem`). Toggle en el topbar (`components/layout/theme-toggle.tsx`); la preferencia
  persiste (localStorage `theme`). `app/layout.tsx` usa `suppressHydrationWarning`.

## Testing (F5)

- **Vitest + React Testing Library + jsdom**; **MSW (node)** intercepta toda la red — **ningún
  test toca el backend real** (`mocks/server.ts`, lifecycle en `vitest.setup.ts`).
- Cobertura: `lib/api/client` (GET, query, `ApiError`, **401→refresh→retry**, **expiración→logout**),
  **login** (`AuthContext` + payload), **mappers** de services/products/customers/**conversations**/
  **appointments** (crear/cancelar/reagendar), **SSE** (`mapSseEnvelope`), `lib/errors` y schemas Zod.
- Ejecutar: `npm run test`.

## Formularios (F5)

Validación con **React Hook Form + Zod** (`@hookform/resolvers`). Los esquemas viven en
`lib/validation/schemas.ts` (única fuente de verdad, testeados): `loginSchema`, `serviceSchema`,
`productSchema`, `customerSchema`. **Convertidos**: login. **Pendientes de migrar al patrón**
(hoy con validación manual funcional): clientes/servicios/productos (dialogs), citas
(crear/reagendar/cancelar), configuración, fichas, agentes y onboarding — ver "Estado pendiente".

## CI/CD (F5)

`.github/workflows/ci.yml` corre en push a `main` y en PRs: **install → lint → typecheck → test →
build**. Cualquier paso que falle hace fallar el workflow. Node 24, `npm ci --legacy-peer-deps`.

## Deploy (F5)

- `vercel.json`: framework Next.js, `installCommand` con `--legacy-peer-deps`.
- Variables de producción en `.env.production.example`. En producción
  **`NEXT_PUBLIC_API_MOCKING=disabled`** ⇒ MSW **no se carga** (lo gatea `app/providers.tsx`) y toda
  la red va al backend real.
- `NEXT_PUBLIC_API_URL` apunta al backend real; `NEXT_PUBLIC_META_*` para el Embedded Signup.

## Auditoría de seguridad frontend (F5)

| Ítem | Estado | Evidencia |
|------|--------|-----------|
| Access token | ✅ solo en memoria (estado React `AuthContext`), nunca en storage | `lib/auth/AuthContext.tsx` |
| Refresh token | ✅ cookie httpOnly `yitopro_refresh` (scope `/api/auth/`), `credentials:"include"` | `lib/api/client.ts`, `lib/sse` |
| Token no se decodifica | ✅ JWE opaco; el cliente nunca lo parsea | — |
| localStorage para auth | ✅ no se usa | grep |
| sessionStorage | ✅ solo datos de formulario del onboarding (no auth) | `lib/onboarding/onboarding-context.tsx` |
| Secretos en bundle | ✅ solo `NEXT_PUBLIC_*`; `META_APP_SECRET` solo en backend | `.env.example` |
| Sanitización | ✅ contenido de WhatsApp se renderiza con `stripTags`; sin `dangerouslySetInnerHTML` | `message-bubble.tsx` |
| Errores técnicos | ✅ nunca se muestran stack traces; mensajes por código vía `lib/errors` | `app/error.tsx` |
| Autorización | ✅ el frontend solo gatea login (`RequireAuth`); el backend autoriza y aísla por tenant | `lib/auth/auth-guard.tsx` |
| Multi-tenant | ✅ el cliente nunca envía `business_id`; el backend filtra por token | mappers en `lib/api/*` |

## Troubleshooting

- **`npm install` falla por peers** → usa `npm install --legacy-peer-deps`.
- **MSW no intercepta / rutas mockeadas dan 404** → corre `npx msw init public` (worker gitignored).
- **SSE no llega en dev** → el backend debe estar arriba; `uvicorn --reload` puede quedar colgado al
  editar código si hay una conexión SSE abierta (reinicia el contenedor `api`). En prod (gunicorn) no aplica.
- **Modo oscuro no cambia** → confirma que `ThemeProvider` está montado (`app/providers.tsx`).
- **Tests "tocan red"** → MSW está en modo `onUnhandledRequest: "error"`; agrega un handler con `server.use(...)`.

## Estado pendiente (documentado)

- **Migración a RHF+Zod**: hecha en login; el resto de formularios usa validación manual funcional
  (mismos campos/reglas) — migrar siguiendo `lib/validation/schemas.ts`.
- **Dominios aún en MSW** (el backend no expone el shape/endpoint completo): **businesses/settings**
  (sin `assistant_config.display_name`/`autonomous` ni `/business/onboarding`), **records** (sin
  `schema`/`audit` en `RecordOut`), **agents** (sin endpoint). Son los únicos handlers en
  `mocks/handlers/index.ts`; el seed (`mocks/data/seed.ts`) solo conserva su data.
