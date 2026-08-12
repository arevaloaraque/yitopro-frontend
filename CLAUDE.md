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
                      #   appointments, services, products, orders, payments, reports, customers
                      #   (drawer de ficha/notas), agents, settings, _design   (la ficha ya no
                      #   es una ruta: vive en el drawer)
components/           # UI: ui/ (shadcn), states/ (loading/empty/error), schedule/ (editor semanal
                      #   de horarios), orders/, customers/, reports/ (bloques de /reports:
                      #   core-strip, appointments/orders/payments-block, revenue-chart,
                      #   csv-export-button) y componentes compartidos
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
  api/                # client.ts + servicios tipados por dominio (única capa de red);
                      #   reports.ts es la de /reports (ventana obligatoria, Decimales
                      #   string→number, moneda por fila)
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

## Reportes (`/reports`) — la pantalla de valor, solo para el dueño

Lo que yitopro hizo por el negocio en una ventana. Backend: `apps/reports`
(`GET /api/reports/value-summary/` + `GET /api/reports/export.csv`, agregación
read-only con ventana obligatoria); frontend: `app/(app)/reports/page.tsx` +
`components/reports/` + `lib/api/reports.ts`.

- **El guard solo redirige a `role === "staff"`.** Con el rol ausente (el fallback
  sin rol del login) NO se redirige: el backend contesta 403 y se muestra el error
  real — esconder la sección por un rol que aún no cargaba le ocultaba los reportes
  al dueño de forma intermitente. Un 403 no ofrece reintentar: el mensaje ES la
  respuesta.
- **Los bloques de dominio gatean por actividad DE POR VIDA**, no por feature flags
  ni por rubro: el backend devuelve cada bloque en `null` cuando el negocio nunca
  tuvo esa actividad, y `null` aquí significa NADA — ni la tarjeta ni su título. Un
  gate más laxo dibujaría tarjetas que solo pueden decir cero.
  **La regla es que el gate sea el MISMO predicado que el contador**, y por eso el
  bloque de agenda tiene DOS: `ai_active_count` mide al asistente (gate: alguna cita
  `origin=ai` vigente) y los dos rankings miden la operación del negocio (gate:
  cualquier cita no cancelada). Cada clave viaja `null` por separado. Sin el segundo
  gate, un negocio que agenda solo desde el panel (`origin='admin'`) no vería nunca
  su propio reparto — medido en vivo: el tenant demo devuelve `ai_active_count: null`
  con los dos rankings poblados.
- **PROHIBIDO ramificar por industria** (`industry`, `applied_templates`,
  `settings["industry_template"]`): la pantalla es UNA para todos los negocios; lo
  que cambia entre rubros son los gates de actividad, nunca el layout.
- **Los rankings de agenda dicen «agendadas», NUNCA «atendidas»**, y cuentan por
  VOLUMEN, nunca por ingresos. Dos razones medidas, no de estilo: (1) nadie escribe
  `completed`/`no_show`, así que «atender» no es medible — solo «tener citas
  agendadas»; y excluir canceladas cambia la respuesta, no la matiza: en el único
  negocio con datos, por citas totales el top es Anyelo con 4, excluyendo canceladas
  es Yitzon con 1. (2) `Payment.service` está poblado en 2 de 8 cobros = 8,8% del
  dinero, así que un «servicio más rentable» vería menos de una décima parte.
  Tampoco hay superlativos («tu profesional estrella»): lista rankeada con el conteo
  al lado, porque con una sola cita coronar a alguien dice más de lo que el dato
  aguanta.
- **El selector de profesional vive DENTRO del bloque de agenda**, no en la barra
  global (`?prof=`). Es el único sitio donde cambia algo: `Payment` no tiene FK a
  profesional y `Conversation`/`Message` tampoco. En la barra dejaría 4 de 6 tarjetas
  inmóviles, que se lee como un filtro roto. Acota `by_service` y `ai_active_count`;
  **`by_professional` lo ignora a propósito** — si se auto-filtrara a una fila
  dejaría de ser un ranking. Con un solo profesional el desplegable no se dibuja.
- **Con `replies` en cero no se muestra ninguna tarjeta en cero**, pero los bloques
  de dominio SIGUEN: un período sin mensajes puede tener dinero cobrado, y
  esconderlo porque nadie escribió es perder el dato que sí existe.
  **La frase «Tu asistente todavía no ha atendido a nadie» solo aparece si la ventana
  cubre la vida entera del negocio** (`p=inicio` y `days >= daysSinceSignup`). Ancla
  en la vida del negocio y el cero es de la ventana: a un negocio de 120 días que
  elige «Últimos 7 días» tras una semana tranquila le decía, a un clic, que nunca
  había atendido a nadie. Cualquier otra ventana vacía → `EmptyState` del período.
- **La moneda es POR FILA, nunca asumida**: cada serie, total y porción del donut
  trae su `currency` y se formatea con `formatPrice(amount, currency)`. **Prohibido
  `useMoney` aquí**: no hay una sola moneda del negocio que valga para todas las
  filas (sumar CLP con PEN es mentir en las dos).
- **El MoM tiene piso** (`MIN_COMPARABLE_PAYMENTS = 3`, `payments-block.tsx`): con
  1-2 cobros en la ventana previa el porcentaje es ruido aritmético (un solo cobro da
  «+4.000%»), así que debajo del piso la línea dice «Sin período comparable» y
  declara la base.
- **El tiempo de respuesta se muestra CON su recorte**: el backend solo mide
  respuestas dentro de `cutoff_s` (300 s — una más lenta es de ritmo humano y
  contarla haría propaganda de la métrica), y la tarjeta nombra el recorte y el `n`
  sobreviviente («p90 Ys · base: X de Y respuestas bajo <5 min»). El número grande YA
  es la mediana: el subtítulo no la repite. `response_time` null → la tarjeta no
  existe.
- **El gráfico rellena los días sin cobro con 0** (`revenue-chart.tsx`): el backend
  omite esos días y recharts espacia los puntos de forma uniforme, así que un salto
  de dos semanas se dibujaba igual que uno de un día — la pendiente contaba un ritmo
  que no ocurrió. La rejilla se recorre con `Date` local, no sumando 86.400.000 ms,
  para que un cambio de horario de verano no salte ni repita una fecha.
- **Dos tarjetas más, cada una con su gate**: «Cómo te escriben tus clientes»
  (`customers-block.tsx`) y «Lo más vendido» (`products-block.tsx`). La primera mide
  **CONDUCTA DEL CLIENTE, NO satisfacción** —el evaluador puntúa 1 = hostil … 5 =
  excelente y no juzga al negocio—, así que el título y el subtítulo están obligados a
  decirlo: presentarla como «calificación» a secas haría leer un 2,3 como servicio malo,
  que es lo contrario del dato. Muestra los CINCO escalones aunque valgan cero (la forma
  ES el dato) con la etiqueta textual de cada uno. La segunda cuenta UNIDADES, nunca
  dinero, por lo mismo que el contador de pedidos.
- **Los rankings colapsan en 5 filas y ofrecen el resto** (`rank-list.tsx`, compartida
  por agenda y tienda). El backend manda hasta `RANK_LIMIT=20`: con cinco no había forma
  de llegar a la sexta fila, así que un negocio de quince profesionales veía un tercio de
  su agenda sin ninguna pista de que faltaba algo. El tope se nombra en pantalla — una
  lista recortada que no lo declara se lee como completa.
- **UNA anatomía de tarjeta, en `report-card.tsx`**, y es estructura, no estilo. Medido con
  Playwright: las siete tarjetas de bloque tenían CUATRO cabeceras de alto distinto, así que
  el contenido arrancaba en 89 / 109 / 127 / 135 px — tres gráficos de la misma fila
  empezando a tres alturas, con los pies cuadrados y la fila leyéndose desordenada. Tres de
  siete tenían subtítulo, seis de siete icono, y una traía un desplegable donde las demás
  tenían el icono. Reglas: **subtítulo OBLIGATORIO de dos líneas con `h` fija y
  `line-clamp-2`** (`min-h` no bastaba: tres líneas empujaban el contenido 18 px), **icono
  siempre** arriba a la derecha (ningún control ocupa su sitio: un filtro va en el
  contenido), y **pie anclado con `mt-auto`**. Resultado: título e inicio de contenido en un
  ÚNICO offset en las siete.
- **Layout: «Cobros» a ancho completo en su propia franja + las SEIS del detalle todas del
  mismo tamaño** en dos filas de tres (`lg:auto-rows-fr`). El `auto-rows-fr` va SOLO desde
  `lg`, que es donde hay tres columnas: sin breakpoint, en móvil —una columna, seis filas—
  igualaba las seis a la más alta y la página pasaba de 3.821 a 5.758 px. Cobros va FUERA de
  esa grilla porque metido dentro su fila entraba en el reparto y arrastraba a las otras
  seis. Ya no hay `items-start`: con la anatomía única, estirar reparte aire entre contenido
  y pie en vez de crear cajones vacíos — que era el defecto original («Pedidos», una frase,
  dibujado tan alto como la agenda entera).
- **`COLLAPSED_ROWS = 3` es una decisión de LAYOUT, no de contenido**: la agenda apila dos
  rankings y es la que fija la altura común de las seis. Con cinco filas cada lista medía
  819 px y las demás —una de 196— quedaban con más de 600 px de aire.
- **El período vive en la URL** (`?p=`, `useUrlFilters`: una vista se comparte y sobrevive
  un reload) y la ventana es obligatoria — días LOCALES inclusivos — porque sin ella cada
  agregación sería un scan del historial completo del tenant.
- **UN solo tope, 90 días, y el MISMO en los dos lados** (`MAX_RANGE_DAYS` en
  `lib/api/reports.ts` y en `apps/reports/api.py`). **No existe «desde el inicio»**: anclaba
  en el alta del negocio y podía llegar a 366 días, que es justo la consulta que este
  endpoint no debe permitir — cada llamada abre media docena de agregaciones (respuestas,
  derivaciones, la LATERAL del tiempo de respuesta, citas, pedidos, líneas de pedido,
  calificaciones, cobros, enlaces). Ese preset era además la puerta trasera: podía pedir un
  año mientras el rango escrito a mano se quedaba en un trimestre. Ojo: el
  `MAX_RANGE_DAYS=366` de `apps/appointments/api.py` NO se toca — una pantalla de calendario
  sí puede preguntar por un año.
  El default es `90`, el preset más largo: antes era «desde el inicio» precisamente porque
  los presets cortos están vacíos el primer mes de un negocio, y 90 conserva esa intención.
  Verificado en vivo: 90 días → 200, 91 y 366 → 400 en value-summary Y en export.csv;
  `?p=inicio` escrito a mano cae al default y pide 90, no 366.
  **Consecuencia a no descubrir por sorpresa**: en un negocio de más de 90 días la frase
  «tu asistente todavía no ha atendido a nadie» ya no puede aparecer, y es correcto — con una
  ventana de 90 días no se puede afirmar nada sobre toda la vida de un tenant más viejo. Por
  eso `isLifetimeWindow` es ahora solo `range.days >= daysSinceSignup`, sin preset
  privilegiado.
  Además de los presets hay **rango personalizado** (`?p=custom&from=&to=`), con el tope
  aplicado DOS veces: el `max` del campo «hasta» impide elegir la fecha inválida, y
  `customRangeError` cubre la URL escrita a mano. Un par a medio escribir, invertido o pasado
  de tope **no dispara petición**: se muestra el motivo junto a los campos y en pantalla se
  queda la última ventana buena.
- **Los controles de la cabecera miden todos lo mismo** (36 px en desktop, 44 en móvil por
  el mínimo táctil): «Exportar cobros» va con `size="lg"`, no `sm`. Medido: con `sm` el
  botón quedaba en 28 px y su borde superior 8 px por debajo del selector y de los campos
  de fecha —alineados por la base pero visiblemente descolgado—.
- **recharts se carga solo aquí** (`next/dynamic`, `ssr: false`): el resto del panel
  no paga el peso de la librería de gráficos. El CSV lo descarga `csv-export-button`
  envolviendo en un Blob el TEXTO que devuelve `exportValueCsv` — ningún componente
  habla con la red. El botón se llama «Exportar cobros» y **desaparece con el bloque
  de pagos en `null`**: prometía el reporte entero y bajaba solo los cobros, y sin
  cobros el archivo era la fila de encabezados.
- **BARRAS, no línea, y agrupadas por ventana** (`revenue-chart.tsx`): una línea
  afirma continuidad entre puntos y el cobro es un hecho discreto. Con la serie
  diaria rellenada a cero, 121 días con 7 de cobro salían como siete agujas — y un
  negocio con un solo cobro, como un pico entre 120 ceros. `grainFor()` agrupa por
  día (≤31), semana (≤120) o mes, lo que deja siempre entre 5 y ~31 barras. La
  rejilla avanza por CAMPO de fecha, nunca sumando 86.400.000 ms (test de mutación:
  con ms se salta el 2026-09-06, la noche que Chile adelanta el reloj; el test fija
  `TZ` porque en CI el proceso corre en UTC y pasaría sin probar nada). El mejor
  período va en `accent` y **el pie lo nombra con su fecha y su monto**: el color no
  es el único portador. Una moneda con menos de dos períodos con cobro no dibuja
  gráfico. El compacto del eje es propio, no `Intl` con `notation:"compact"`, que en
  `es-CL` mezcla «3,5 K» con «80 k» y aplasta 1.031.000 a «1 M».
- **El color de una categoría va por CLAVE, nunca por índice de array**
  (`KIND_COLORS`): por índice, «Cobros sueltos» salía verde en el donut de CLP —donde
  es el tercero— y morado en el de USD, donde es el único.
- **Layout: UNA grilla para todos los bloques**, `items-start` + `grid-flow-row-dense`
  (`page.tsx`). Sin `items-start` las celdas de una fila se estiran a la altura de la
  más alta, que era por qué «Pedidos» —una frase— se dibujaba como una caja vacía tan
  alta que la agenda entera cabía dentro. El dinero va PRIMERO y ocupa dos columnas;
  antes empezaba bajo el fold, detrás de cinco contadores de proceso. `PaymentsBlock`
  devuelve un FRAGMENTO con tres tarjetas (cobros / composición / enlaces) para que
  sean hijas directas de esa grilla y se puedan repartir.
- **La cabecera se dibuja siempre, también mientras carga.** Antes la página entera se
  reemplazaba por el cargador, así que cambiar de período desmontaba el desplegable
  recién usado y el foco de teclado caía al `body`.
- **Movimiento (`lib/motion.ts`, anime.js v4 importado dinámicamente).** Tres reglas:
  el contenido es VISIBLE por defecto y quien oculta es el módulo, solo cuando va a
  animar (un `opacity-0` en CSS deja la pantalla en blanco si el JS falla); el
  ocultado es SÍNCRONO antes del paint porque el import es asíncrono; y hay red de
  seguridad —si el chunk no carga, el contenido se restaura solo (verificado en
  navegador abortando el chunk)—. La entrada corre **una sola vez**: cambiar de
  período remonta el contenido y sin el interruptor `entrance` la coreografía se
  repetiría en cada clic, justo cuando se quiere comparar dos números. Se anima solo
  `opacity`/`transform` y `scaleX` en las barras (nunca `width`: reflow por frame).
  Cuatro capas, las cuatro verificadas en navegador real (14 comprobaciones, incluida la
  del chunk abortado): entrada escalonada de tarjetas (`translateY 18px` + `scale .985`,
  560 ms, stagger 70 — con 10 px y sin escala el movimiento existía pero no se notaba),
  **pop de los iconos** con `outBack` (`data-card-icon`), **crecimiento de las barras** por
  `scaleX` (nunca `width`: reflow por frame) y **trazado del donut** por `stroke-dasharray`
  y NO por `dashoffset`, que está ocupado colocando cada porción en su ángulo.
  Y capas que siguen vivas después de la carga (`useAmbient`), con **dos grupos de fase y
  ritmo distintos** — si todo respirara al mismo compás la pantalla pulsaría como un bloque,
  que es justo lo invasivo: `[data-card-glow]` (halo detrás del icono, opacidad + escala,
  4,6 s, desfase 320 ms) y `[data-card-icon]` (escala 1→1.06, 3,2 s, desfase 240 ms). Hay uno
  de cada POR TARJETA, así que la vista entera respira sin que se mueva nada del contenido.
  Más el **levantado de 3 px al pasar el puntero**, que es finito. Todo **se pausa con la
  pestaña oculta** (`visibilitychange`): un bucle infinito en una pestaña de fondo gasta
  batería para nadie, y el observador purga del registro las tarjetas que un filtro
  desconectó, para no dejar tickers sobre nodos huérfanos.
  **TRES cosas que NUNCA se animan en bucle, las tres por medición:** (1) ningún DATO — un
  número o una barra a media animación es un valor falso y un bucle no termina, así que no
  habría un instante en el que fuese cierto; (2) ninguna CAJA CLICABLE — una versión
  flotaba la tarjeta entera ±2 px y Playwright se negó a hacer hover con «element is not
  stable». No era cosa del test: cada tarjeta lleva enlaces «Ver…», y un blanco en
  movimiento perpetuo es difícil de apuntar con el ratón y hostil para quien tenga temblor o
  control motor reducido. De ahí que el ambiente viva en elementos DECORATIVOS
  (`aria-hidden`, `pointer-events-none`) dentro de cada tarjeta; (3) NADA DENTRO DEL
  GRÁFICO — hubo un latido sobre el punto del mejor período y se quitó: un elemento en
  movimiento encima de los datos compite con su lectura. El punto sigue destacado (`accent`,
  radio mayor) y el pie lo nombra con su fecha y su monto, que es lo que de verdad lo señala.
  Dos trampas que costaron una medición cada una, y las dos por lo mismo — el hook corre
  ANTES de que exista lo que busca: el punto del gráfico llega por `next/dynamic` y recharts
  lo pinta después (se resuelve con un `MutationObserver`, que además cubre el repintado al
  filtrar), y en el primer render la página devuelve el cargador SIN el contenedor, así que
  `ref.current` era `null` y el efecto salía para no volver (se resuelve con la dependencia
  `enabled`). El hover va por DELEGACIÓN en el contenedor, no con un listener por tarjeta,
  para que dé igual cuándo aparezcan y sobreviva a que los bloques cambien.
  Los tres hooks de nivel de página RECIBEN la ref en vez de crearla: operan sobre el mismo
  contenedor y un nodo del DOM no admite tres refs.
  `prefers-reduced-motion` se respeta en los SEIS sitios donde puede nacer una animación —
  los cinco hooks del módulo, `useCountUp` y el `isAnimationActive` de recharts, que no
  consulta la preferencia por su cuenta.
- **Ninguna tarjeta del núcleo lleva chip de variación**: el backend solo devuelve
  ventana previa para cobros. Un «+31% vs la semana pasada» en cada tarjeta, como el
  de cualquier plantilla, aquí sería inventado. El chip del MoM lleva flecha además
  de color.
- **`by_trigger` es `Record<string, number>`** en el tipo del front, como el
  `dict[str, int]` del backend: declararlo con las cuatro claves de hoy hacía que un
  quinto motivo viajara en la respuesta y desapareciera del tipo. En la tarjeta de
  derivaciones se nombra el motivo dominante **solo si no hay empate** —con empate,
  «el principal» sería el que el backend serializó primero— y el número que manda es
  el de las que **siguen esperando**, no el de las atendidas.

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
