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
- SSE por `fetch`+Bearer (no `EventSource`: el token de acceso va por header)
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
  **Implementado:** login/refresh/logout reales (`lib/api/auth.ts`), interceptor single-flight
  en `lib/api/client.ts`. En el **boot** `AuthContext` intenta un refresh silencioso con la cookie
  httpOnly; si hay sesión válida se restaura al recargar (si no → `/login`). El backend debe
  permitir CORS con credenciales (ver README).
- **Sanitizar** todo contenido externo que se renderice (mensajes de WhatsApp de clientes).
- Solo `NEXT_PUBLIC_*` son públicos; **ningún secreto en el bundle**. `META_APP_SECRET` jamás
  llega al cliente; en Embedded Signup solo el `code` corto viaja al backend.
- El frontend no toma decisiones de seguridad ni de aislamiento multi-tenant; eso lo valida el backend.

## Estructura del proyecto

```
app/                  # rutas (App Router): login, activar (set-password de invitación),
                      #   (onboarding)/onboarding (wizard de 8 pasos), (app)/dashboard, conversations,
                      #   appointments, services, products, orders, payments, customers (drawer de
                      #   ficha/notas), agents, settings, _design   (la ficha ya no es una ruta:
                      #   vive en el drawer)
components/           # UI: ui/ (shadcn), states/ (loading/empty/error), schedule/ (editor semanal
                      #   de horarios), orders/, customers/ y componentes compartidos
                      # orders/: la LISTA identifica el pedido (N.º, cliente, total, estado,
                      #   origen, fecha) y NO lleva ítems — el contenido se lee en el
                      #   detalle. `order-detail-dialog.tsx` es un MODAL (misma distribución
                      #   que el editor: `grid-rows-[auto_minmax(0,1fr)_auto]` + `max-h-[85vh]`,
                      #   así scrollea solo el medio y las acciones no se van de pantalla);
                      #   muestra contacto (`tel:`/`mailto:`), líneas con subtotal, aviso de
                      #   stock insuficiente ANTES de confirmar, aviso de precio desfasado y
                      #   las conversaciones DEL CLIENTE —rotuladas así porque no existe
                      #   relación Order→Conversation en el modelo: el chat exacto que originó
                      #   un pedido no es derivable, y adivinarlo por fechas se leería como
                      #   dato duro—. Un pedido confirmado sigue mostrando sus líneas: antes la
                      #   tabla vivía solo en el diálogo de edición, que abre únicamente en
                      #   borrador, así que confirmar volvía el contenido inalcanzable.
                      #   La columna «Acciones» lleva una IMPRESORA en todas las filas —es la
                      #   única acción válida en cualquier estado, y por eso va primero: cae
                      #   en la misma x en toda la columna, que antes quedaba vacía en los
                      #   confirmados y cancelados—. `order-print-sheet.tsx` es el
                      #   comprobante: TEXTO PLANO (monoespaciado, negro, sin distintivos ni
                      #   iconos), con cabecera del negocio, cliente, número, estado, ítems
                      #   (nombre/cant./p. unit./subtotal) y total a la derecha. NO es el
                      #   formato de la modal ni incluye conversaciones. Se imprime aislando
                      #   `#order-print-root` con `@media print` en globals.css (`visibility`,
                      #   no `display`: así el subárbol se impone aunque los ancestros estén
                      #   ocultos) en vez de abrir una ventana nueva, que no heredaría los
                      #   estilos y la bloquearía el popup blocker. El PDF sale de «Guardar
                      #   como PDF» del diálogo del navegador: no hay librería de PDF en el
                      #   bundle. `afterprint` desmonta la hoja —cubre imprimir Y cancelar—.
                      #   `order-meta.tsx` centraliza estado y origen con ICONO + TEXTO (nunca
                      #   solo color). Cancelar pasa por un `Dialog` propio, no `window.confirm`:
                      #   la acción mueve inventario y hay que poder nombrar la consecuencia.
                      #   La FILA no es `role="button"` (tiene botones dentro; anidar controles
                      #   los lee mal un lector de pantalla): el foco de teclado vive en un
                      #   <button> real en la celda del número, y esa columna NO se oculta en
                      #   móvil porque es el único acceso por teclado al detalle.
lib/
  types/              # tipos de dominio (reflejo del backend)
  api/                # client.ts + servicios tipados por dominio (única capa de red)
  sse/                # abstracción de eventos en tiempo real (interfaz estable)
  auth/               # AuthContext (login/refresh/logout + acceptInvite), useAuth
  business/           # BusinessProvider/useBusiness (perfil + config del negocio)
  agents/             # AgentsProvider/useAgents (agentes de IA)
  orders/             # OrdersProvider/usePendingOrders (pedidos + badge de pendientes en el nav)
  schedule/           # windows.ts (grilla semanal ↔ ventanas de horario del backend)
  notifications/      # NotificationsProvider (toasts + campana alimentados por SSE)
                      #   sound.ts: sonidos sintetizados con Web Audio (sin asset), con un
                      #   secuenciador por pasos (duración, nivel, onda y glissando por
                      #   nota) porque lo que distingue un sonido de otro es el GESTO, no la
                      #   altura: paleta de 9 timbres inspirada en Slack. 3 slots
                      #   configurables — mensajes / pedidos / agenda — que NUNCA comparten
                      #   timbre (se repara al LEER, no solo al escribir), más el mute y un
                      #   volumen 0.05-1. Todo en localStorage: es preferencia de la persona
                      #   en el panel, no dato del negocio → por navegador, sin endpoint. Se
                      #   edita en Ajustes → Notificaciones. `alert` es fijo y está FUERA de
                      #   la paleta (un toque grave doble): significa "alguien espera a una
                      #   persona" y quien le pusiera su ping de mensajes dejaría de notar
                      #   las escaladas. Ojo con Tailwind + Base UI: las variantes
                      #   `data-*` tienen que coincidir con lo que el primitivo emite de
                      #   verdad (`data-orientation="horizontal"`, no `data-horizontal`) —
                      #   una variante que no matchea compila igual y no falla ningún test.
                      #   El TOAST: tope de 4, aplicado en `notify()` descartando el más
                      #   viejo — NO con `visibleToasts` a secas, que deja los sobrantes
                      #   montados en `data-visible="false"` y opacidad 0 (medido: 7 en el
                      #   DOM con 4 en pantalla). Los descartados siguen en la campana, así
                      #   que no se pierde nada. `expand` va puesto: sin él sonner apila en
                      #   profundidad escalando cada toast (1/.95/.9/.85), los bordes
                      #   derechos se corren y los enlaces «Ver» caen en x distintas
                      #   (1363/1357/1351/1344) en vez de formar columna.
                      #   Cierre propio arriba a la DERECHA (sonner lo
                      #   pone a la izquierda, donde están el icono y el título), y un
                      #   distintivo circular a la izquierda que dice de QUÉ dominio es el
                      #   aviso —pedido / cita / mensaje / conversación / error, con campana
                      #   como respaldo para un tipo nuevo—.
                      #   La tarjeta se dibuja con `toast.custom`
                      #   (`lib/notifications/notification-toast.tsx`), NO con
                      #   `toast.success/error/…`, y TODA LA CAJA ES EL ENLACE: no hay botón
                      #   «Ver» adentro. Ese botón costó tres intentos de alineación fallidos
                      #   —cualquier posición se leía distinta entre cajas porque el toast no
                      #   tiene alto fijo—; con la tarjeta navegable no hay nada que alinear.
                      #   Markup propio además saca del medio la pelea con la hoja de sonner,
                      #   que se inyecta en RUNTIME y ganaba por orden de cascada: se
                      #   eliminaron 68 líneas de globals.css que existían solo para vencerla
                      #   y para dimensionar su slot de icono, forzado a 16x16.
                      #   El botón de cerrar es HERMANO del enlace, no hijo (un botón dentro
                      #   de un <a> es un control anidado, y así cerrar no navega).
                      #   `min-h-[5.75rem]` en la tarjeta: todas miden lo mismo con el alto
                      #   del aviso más largo, así ninguna recorta texto; es `min-h` para que
                      #   un mensaje futuro más largo crezca. Ojo: no todo aviso tiene `href`
                      #   —los de error no tienen a dónde ir— y esa tarjeta no es navegable.
                      #   El tono solo distingue error (borde rojizo) del resto: el color de
                      #   dominio lo lleva el distintivo, no el sabor del toast.
  format/             # date.ts (formatDateTime / relativeTime / listDate). OJO: había OCHO
                      #   copias privadas de esta lógica en 3 dialectos distintos
                      #   (`hace 5m` / `5m` / `hace 5 min`), ninguna exportada. El código
                      #   nuevo importa de acá; migrar las ocho es otra tarea.
  consts/             # constantes de dominio compartidas
  onboarding/         # OnboardingProvider (estado+persistencia del wizard), tipos,
                      #   use-onboarding-redirect (ruteo por onboarding_status)
mocks/
  server.ts           # setupServer() de MSW para tests (Node); sin handlers por defecto
```

## Pagos (`/payments`) — el contrato pensado para millones de filas

La lista de pagos es la primera pantalla del panel construida para un tenant con
más filas de las que se pueden contar barato, y el contrato lo refleja:

- **La lista mezcla pagos y enlaces sin pagar.** Un enlace acuñado no tiene fila
  `Payment` hasta que el cliente lo abre, así que la tabla de pagos sola no
  responde «¿qué mandé y quién no me pagó?». Cada fila trae `kind`: un `link`
  se describe por su `concept` (no tiene medio ni proveedor: los muestra como
  «—» y «Sin elegir»), su estado es **Enviado** —badge azul, distinto de
  «Pendiente», que significa que el cliente llegó hasta la pasarela y pide otro
  seguimiento— y su `reference` es la cola del uuid, nunca el secreto. Un enlace
  ya pagado no aparece: su pago es la fila.
- **Paginación por cursor, sin `count`.** `GET /api/payments/` devuelve
  `{items, next_cursor, has_more}` y **nunca** un total. `OFFSET 200000` obliga a
  Postgres a recorrer y descartar doscientas mil filas, y `COUNT(*)` sobre un
  recorte filtrado las lee todas otra vez, por página, para un número sobre el que
  nadie actúa. El cursor es **opaco**: se devuelve tal cual y no se construye ni se
  parsea en el cliente. Lleva `(created_at, id)` porque `created_at` no es único y
  un keyset sobre una columna repetida se salta o duplica filas en el borde.
- **Por eso el pie dice «25 pagos (hay más)» y no «25 de 4.312»**. Si aparece un
  «de N» en esta pantalla, alguien reintrodujo el `COUNT`.
- **El resumen es lo único que suma, y solo sobre una ventana acotada.**
  `GET /api/payments/summary/` **exige** `created_from`/`created_to` (tope de 366
  días) y agrupa por moneda — sumar CLP con USD da un número equivocado en las dos.
  Los filtros de periodo son _presets_, no un date picker libre: así el tope es
  estructural y no un 400 que hay que explicar después.
  La tarjeta toma **solo la ventana, sin los filtros de la tabla**: cuenta pagados
  por definición, así que arrastrar el filtro «Pendientes» la dejaba en `$0`.
- **`search` es un PREFIJO de `trans_id`, sensible a mayúsculas** — es lo que el
  btree único de esa columna puede servir. Buscar por persona es el filtro
  `customer_id` (FK indexada), y la ayuda bajo el campo lo dice, porque un «buscar»
  que solo matchea el inicio se lee como roto.
- Los filtros viven en la **URL** (`replaceState`), así que una vista filtrada se
  comparte y sobrevive un reload.
- Además de los presets hay **rango personalizado**, con tope de **31 días**: un
  preset es finito y conocido, un rango libre es el que un operador puede hacer
  enorme sin querer, y el resumen que va detrás es la consulta que lo paga. Un par
  de fechas a medio escribir no dispara request: se queda la última ventana buena.
- El monto se formatea **por fila** con `formatPrice(amount, currency)` y no con
  `useMoney()`: cada pago trae su moneda y el formateador atado al tenant
  imprimiría un cobro en USD con símbolo de pesos.
- En móvil las columnas **se caen por breakpoint** en vez de esconderse tras un
  scroll horizontal: el scroll dejaba «Cliente | Medio» en pantalla y empujaba
  fuera monto y estado, que es justo para lo que se abre la tabla.
- **Generar enlace** (`POST /api/payments/links/`) responde con la URL, y esa
  respuesta es el **único** lugar donde el secreto existe (del lado servidor solo
  se guarda su sha256). Por eso el diálogo no cierra al crear: pasa a un segundo
  paso de copiar-o-perder, y lo dice.
  El cobro apunta a **una cita o un pedido, nunca ambos** —el backend responde 400
  al par—, así que es **un solo** `Select` sobre la unión (`appointment:12` /
  `order:7`): dos selectores dejarían armar una combinación que la API rechaza.
  Ambas listas se piden **por cliente** (`?customer_id=`); sin eso el operador
  podía colgarle a este cobro la cita de un tercero. Elegir cualquiera de los dos
  **carga su monto registrado** —el `total` congelado del pedido, o el
  `service_price` que `AppointmentOut` resuelve del lado servidor— en vez de hacer
  que el panel se traiga el catálogo entero para cotizar una reserva. No hay
  selector de servicio: lo que se cobra es una cita o un pedido.
- `pago_recibido` es el evento SSE que refresca la pantalla sola: es la única
  transición que un operador se queda esperando.

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

**Todos los dominios van al backend real** (ya no queda ningún handler MSW en runtime): auth,
businesses/settings, agents, services, products, **orders** (listar + confirmar/cancelar +
badge de pendientes), customers + **records/fichas y notas** (ambos dentro del drawer de cliente),
appointments, conversations (inbox + tomar/cerrar/reactivar/responder), **onboarding**
(professionals, horarios, users/invitaciones, `businesses/me/onboarding/{,/complete}`), **SSE**
(`lib/sse` lee `GET /api/events/stream/` por `fetch`+Bearer, no `EventSource`, porque el token va
por header) y **WhatsApp Embedded Signup** (`POST /api/whatsapp/embedded-signup/callback/`, solo
viaja el `code`). Los desajustes de shape se mapean en `lib/api/<dominio>.ts`, nunca en
componentes. Ver README.

**Eventos SSE de datos (silenciosos, sin toast):** `cliente_creado`, `cliente_actualizado`,
`ficha_actualizada`, `nota_creada`, `servicio_creado`, `servicio_actualizado`, `servicio_eliminado`.
Disparan refetch dirigido en clientes/servicios y en el drawer abierto, con **guarda anti-clobber**
(no pisan ediciones sin guardar). No generan notificación (son eco de la propia acción del operador
o de la IA). El stream emite otros eventos que refrescan estado en vivo (p. ej. `agente_actualizado`,
`negocio_actualizado`, `pedido_creado`); la lista completa está en `lib/types/events.ts`. Diseño de
estos 7: `docs/superpowers/specs/2026-07-11-sse-customers-services-design.md`.

**`pedido_creado` y `pedido_cancelado` también son silenciosos**, por el mismo criterio: son **acciones
del operador**, no trabajo entrando. Quien confirma o cancela ya recibió su propio toast con el número,
el monto y el efecto en el stock; anunciarlos otra vez producía **dos toasts para el mismo acto** —y el
segundo, «Nuevo pedido», era además falso, porque el backend emite `pedido_creado` al **confirmar**, no
al crear. `pedido_borrador_creado` sí queda ruidoso: eso es trabajo nuevo llegando por WhatsApp.

**Un eco propio no debe refetchear** (`components/orders/orders-panel.tsx`): confirmar patchea la fila
con la respuesta del servidor en vez de recargar la lista, porque un refetch con el filtro «Borrador»
puesto pide `status=draft`, el pedido ya no califica y **la fila desaparece** — una acción exitosa
idéntica a un fallo. El evento que la propia acción dispara volvía a romperlo, así que se descarta
(`selfAppliedRef`, de un solo uso). **La marca se pone al INICIAR la acción, no al recibir la
respuesta**: el backend publica post-commit, o sea que el evento le gana la carrera al HTTP (medido: el
refetch salía antes del propio `pending-count`).

## Onboarding (wizard)

Flujo invitado por el operador (el backend manda; ver su `CLAUDE.md`):

- El cliente entra por **`/activar?token=…`** (set-password) → `useAuth().acceptInvite`
  → auto-login → `/onboarding`. El ruteo por `onboarding_status` (login/root/layout vía
  `lib/onboarding/use-onboarding-redirect`) lleva a un tenant pendiente al wizard y a uno
  completo a `/dashboard`.
- **8 pasos**: negocio · profesionales · horarios · servicios · usuarios · whatsapp ·
  agentes · confirmar. El estado vive en `OnboardingProvider`, que **rehidrata del backend
  al montar** (no de `sessionStorage`) y **persiste cada paso** de inmediato (cada mutación
  llama a su `lib/api/*`). `complete()` pega a `POST /businesses/me/onboarding/complete/`
  (gate server-side) y redirige a `/dashboard`.
- **Resume**: al recargar marca lo completado, salta al primer paso pendiente y deja
  navegar a pasos anteriores; horarios y WhatsApp se rehidratan del servidor.
- Reglas UX: horarios = grilla semanal con "Aplicar a todos" (+ override por profesional,
  que muestra el **nombre** del profesional); usuarios invita **solo staff** (un único dueño);
  el estado "WhatsApp conectado" muestra el número real + recomendación, no un id interno.

**Endurecimiento (F5):**

- **Errores**: `lib/errors.ts` (mensajes seguros por código HTTP, sin stack traces) + boundaries
  `app/error.tsx` / `global-error.tsx` / `not-found.tsx`, todos reusando `ErrorState`.
- **Dark mode**: `next-themes` en `app/providers.tsx` (`attribute="class"`), toggle en el topbar;
  tokens claro/oscuro en `globals.css` (base Navy), sin colores nuevos.
- **Testing**: Vitest + RTL + MSW (node) — `npm run test`, ningún test toca el backend real
  (`mocks/server.ts`). **Forms**: RHF + Zod con esquemas en `lib/validation/schemas.ts` (login
  convertido; resto pendiente de migrar — ver README).
- **CI**: `.github/workflows/ci.yml` (install→lint→typecheck→test→build). **Deploy**: `amplify.yml`
  (AWS Amplify Hosting, Next.js SSR/WEB*COMPUTE) + `vercel.json` + `.env.production.example`; ambos
  instalan con `--legacy-peer-deps` y fijan Node 24; en prod `NEXT_PUBLIC_API_URL` apunta al backend
  desplegado. Env vars (`NEXT_PUBLIC*\*`) se definen en la consola del host, no en el repo.
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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
