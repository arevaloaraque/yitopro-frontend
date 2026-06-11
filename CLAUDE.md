# Yitopro Frontend — Guía para Claude Code

Panel de administración SaaS de Yitopro. Negocios atienden clientes por WhatsApp con agentes de
IA; este repo es la interfaz operativa. Backend Django separado (repo `yitopro-backend`).

El desarrollo sigue `yitopro_frontend_execution_plan.md`, sesión por sesión. **Construcción
mock-first:** primero todo con datos falsos, luego se conecta el backend real.

## Stack

- Next.js App Router (v16, Turbopack) + TypeScript + React 19
- Tailwind CSS **v4** (tokens CSS-first vía `@theme` en `globals.css`, sin `tailwind.config`) + shadcn/ui (base: Base UI)
- MSW (Mock Service Worker) para mocks
- `EventSource` nativo para SSE
- Fuente Inter
- Tests: Vitest/Jest + React Testing Library (desde F5)

## Comandos

```bash
npm run dev       # desarrollo (MSW activo si NEXT_PUBLIC_API_MOCKING=enabled)
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
3. **MSW intercepta las mismas rutas que usa `lib/api`.** Conectar el backend = apagar MSW
   (`NEXT_PUBLIC_API_MOCKING=disabled`) + apuntar `NEXT_PUBLIC_API_URL` al Django real. Conectar
   no debe requerir reescribir componentes.
4. **`lib/sse` tiene una interfaz estable** (`subscribeToEvents`). En modo mock emite eventos
   simulados; en real usa `EventSource`. Cambia la implementación interna, nunca la firma pública.
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
  handlers/           # handlers MSW (mismas rutas que lib/api)
  data/               # seed PET (datos mock realistas)
```

## Datos mock

Caso **PET Spa** (peluquería/veterinaria canina): negocio PET Spa, servicios Baño/Corte/Baño+Corte,
clientes con mascotas, fichas con `pet_name`/`species`/`weight_kg`/`vet_notes`, conversaciones de
WhatsApp realistas. Mantener este caso al crear/ampliar mocks para que la validación se sienta real.

## Variables de entorno

```
NEXT_PUBLIC_API_URL=http://localhost:8000   # backend Django
NEXT_PUBLIC_API_MOCKING=enabled             # enabled = MSW intercepta; disabled = backend real
NEXT_PUBLIC_META_APP_ID=                     # WhatsApp Embedded Signup (F4-C)
NEXT_PUBLIC_META_CONFIG_ID=                  # configuration_id de Embedded Signup (F4-C)
```

## Flujo de trabajo por sesión

1. Cada sesión del plan es independiente y trae todo su contexto.
2. No avanzar a la siguiente sesión si la actual quedó incompleta.
3. Respetar los **checkpoints** (fin de F2-E y F3-C): son validación humana de la UI mockeada
   antes de seguir.
4. Commit al cerrar cada sesión:
   ```bash
   git add . && git commit -m "sesión F1-A: proyecto base + fundación de diseño"
   ```

## Qué NO hacer

- No llamar `fetch` desde componentes.
- No escribir hex literales en componentes (solo tokens).
- No persistir el access token fuera de memoria.
- No apagar MSW de golpe al conectar el backend; hacerlo dominio por dominio (F4-B).
- No adelantar la integración real (F4) si el backend no tiene el endpoint listo; dejar ese
  dominio en mock y anotarlo.
