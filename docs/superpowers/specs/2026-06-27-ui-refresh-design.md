# YitoPro UI Refresh — Visual-only redesign

**Date:** 2026-06-27 · **Branch:** main (user choice) · **Status:** in progress

## Non-negotiables
- **Visual only.** No edits to `lib/api`, `lib/sse`, `lib/auth`, routes, MSW handlers, validation, component names, props contracts, or data shapes. Only classNames / tokens / styling-markup.
- **Brand fixed:** `--primary #6D35F2`, `--accent #FF7A1A`, `--foreground #071A3A`. Only derive scales/tints/surfaces.
- **No hex literals in components** — tokens only.
- **Validate every change in the browser** (light + dark), nothing overflows or is hidden.
- Gates before "done": `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` clean.

## Target visual language
Linear / Stripe / Vercel / Notion / Raycast. Soft layered elevation, generous 8-based spacing, modern radii, crisp typographic hierarchy, 150–200ms ease-out motion, glassmorphism **only** on floating overlays (dropdown/select/popover/tooltip/sheet + dialog scrim); cards stay solid for legibility.

## Phase 1 — Token engine + shared primitives
**`app/globals.css`** (biggest lever)
- [ ] Shadow scale: replace ~0.03 near-invisible set with soft navy-tinted 5-level scale (xs→sm→md→lg→**xl** for modals).
- [ ] Add `--info` / `--info-foreground` (light+dark) from existing blue; register in `@theme inline`.
- [ ] Typography base: antialiasing, `text-rendering: optimizeLegibility`, heading `letter-spacing`, body numeric features; `prefers-reduced-motion` guard.
- [ ] Tune borders/surfaces slightly for airiness + verify dark parity. Keep radius base 0.75rem (btn/input already 12px on target).

**`components/ui/*`** (consume the engine)
- [ ] `card` — padding 20→24px (`--card-spacing: spacing(6)`), elevation reads from new scale, stays solid.
- [ ] `input` / `textarea` / `select` trigger — height 36→40px (`h-10`), elegant focus ring, consistent across all three.
- [ ] `badge` — add `warning` + `info` variants → success/warning/danger/info/neutral complete.
- [ ] `table` — roomier cells (px-4), refined header, `tabular-nums`, smooth row hover.
- [ ] `dialog` — radius 24px, padding p-5, modal-level shadow (xl), stronger+blurred scrim for legibility.
- [ ] `dropdown-menu` / `select` content — radius 18px, subtle glass (`bg-popover/…` + backdrop-blur), larger items (py-1.5).
- [ ] `tooltip` / `sheet` — polish radius/shadow/glass to match.
- [ ] `sidebar` / `sidebar-nav` / `topbar` — more air, refined active indicator + hover.
- [ ] `states` (loading/empty/error) — radius/shadow polish to match.

**Checkpoint:** screenshot dashboard + a table page + a dialog, light & dark → user approves direction.

## Phase 2 — Pages & the calendar bug
- [ ] **Calendar (`appointment-calendar.tsx`) — appointments clipped.** Root cause: in `TimeGrid`, box height = duration (`min 32px`) but renders 3 lines (name+actions / service / time) under `overflow-hidden` → short slots clip. Fix: taller hour rows + graceful content degradation by height + detail always reachable (tooltip/popover), no clipping. Also harden week view narrow columns + month cell density.
- [ ] Dashboard red zones (`MetricCard`, `AlertRow`, rows) → new elevation/radii consistency.
- [ ] Screen-by-screen pass: conversations, services, products, customers, records, agents, settings, onboarding, login.

## Phase 3 — Verification sweep
- [ ] Before/after screenshots, every route × light/dark; scan for overflow / clipped / hidden content.
- [ ] `lint` + `typecheck` + `test` + `build` clean.

## Progreso (2026-06-27)
**Hecho y verificado en navegador (claro + oscuro):**
- Token engine: escala de sombras suave (5 niveles + xl modales), `--info`, tipografía base
  (antialias, tracking de títulos, cifras tabulares), `prefers-reduced-motion`, bordes afinados.
- Primitivos: card (elevación + padding 24px), badge (+warning/+info), table (celdas amplias,
  header refinado, tabular), dialog (shadow-xl + glass scrim + radio 24px), dropdown/select (glass
  + radio 18px + ítems grandes), sheet (scrim), tooltip (sombra), sidebar-nav (aire).
- **Calendario**: corregido el recorte de citas (filas 64→80px, orden nombre→hora→servicio,
  servicio condicional por altura, `title` con detalle completo). Verificado semana.
- **Overflow responsive**: toolbar de agenda (wrap + tabs scrollables), header del calendario
  (wrap + min-w móvil), conversaciones maestro-detalle (breakpoint `lg` + botón volver móvil).
  Sweep final: **0 overflow** en 9 rutas × [1440,1280,1024,768,430,390,360].
- Gates: typecheck ✓, lint ✓, build ✓. `test` ✗ por entorno (Node 21 < 24 requerido; vitest no
  arranca — ajeno a los cambios visuales).

**Fase 2 — hecho y verificado:**
- Semántica de badges de estado (sólo color, mismo significado): Activo→success (services/
  products/agents), citas scheduled→info/rescheduled→warning/cancelled→destructive/completed→
  success (list + dashboard), conversaciones ai_active→info/handoff→warning/closed→outline,
  pedidos pending→warning/confirmed→success/draft→outline. Verificado claro + oscuro.
- Calendario día/semana verificado sin recorte; pantallas restantes (products, customers, records,
  settings, login) revisadas claro+oscuro — coherentes, sin overflow.
- Gates finales: typecheck ✓, lint ✓, build ✓ (17 rutas).

**Notas / pendientes menores:**
- Node: `.nvmrc` fijado a `24`. Con `nvm use` (node 24.x), `npm ci` + las 4 gates pasan:
  typecheck ✓, lint ✓, build ✓, **test ✓ (30 tests)**. (El shell por defecto usa Homebrew Node 21,
  que rompe vitest — `node:util.styleText`.)
- Pre-existente: en dark el logo del sidebar va en caja blanca (no hay asset de logo dark; quitar
  la caja ocultaría el logo). Dejado como estaba; sugerir asset dark a diseño.
- Onboarding: el usuario demo ya está onboardeado (redirige a dashboard); no revisado a fondo.
- Sin commit (a la espera de tu OK; se trabajó sobre main).

## Redirección — lenguaje "clay" de la referencia (2026-06-27, tarde)
La primera pasada fue minimal Linear/Stripe; **no coincidía con la referencia real**
(educational-platform demo), que es **claymorphism / soft-neobrutalism**. Tras analizar el demo
(Playwright: estilos computados + captura) se recalibró a su lenguaje, en colores de marca:
- **Tipografía**: Fredoka (títulos, display redondeada) + DM Sans (cuerpo) vía next/font. Adiós Inter.
- **Sombras "clay"**: offset duro sin blur, color de línea navy de marca (`--clay-line #1b3354`),
  tokens `--shadow-clay-xs/clay/clay-lg` (1/3/4px). Intensidad elegida: **"más suave"** para B2B.
- **Bordes gruesos** `1.5px` navy (`border-clay-line`) en botones, cards, inputs, diálogos, tablas,
  dropdowns; fondo **crema** (`--surface #faf6ef`); pesos semibold; primario púrpura (no verde).
- **Botones**: borde + sombra dura + micro-presión (translate+encoge sombra) en hover/active.
- Overlays pasaron de glass → clay (borde navy + sombra dura), salvo tooltip.
- Verificado claro+oscuro (todas las rutas), 0 overflow en 7 anchos, y las 4 gates en verde.

## Verification harness
Backend `:8050` up, dev server `:3000` up, MSW worker present. Auth is real → need local login credentials to reach authenticated screens. Playwright drives login → per-route screenshots (light+dark) → overflow scan.
