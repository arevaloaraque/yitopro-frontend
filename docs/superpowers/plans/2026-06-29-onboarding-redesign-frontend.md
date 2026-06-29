# Onboarding Redesign — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the onboarding frontend to match the redesign: an `/activar` set-password page that drops the invited owner into an authenticated wizard, onboarding-status-aware routing (no more orphaned wizard), and an 8-step wizard that persists each step to the real backend and finishes via the server-validated `complete` endpoint.

**Architecture:** Thin contract layer (`lib/api/*`) over the backend built in the backend plan. The wizard persists incrementally to real tenant tables and rehydrates from the server on mount (no more `sessionStorage` as source of truth). Auth stays in-memory + httpOnly refresh cookie; the invite-accept reuses that session model.

**Tech Stack:** Next.js 16 App Router + React 19 + TypeScript, Tailwind v4 tokens, shadcn/ui, RHF + Zod for forms, Vitest + RTL + MSW for tests.

**Spec:** `../specs/2026-06-29-onboarding-redesign-design.md` (in this repo's docs, §3); backend contract is implemented in `yitopro-backend` (see its plan).

## Global Constraints

- **No commits.** Per the user's instruction (overrides CLAUDE.md's "commit per session"): do NOT create branches or commits. Each task ends with a **Checkpoint** running the gates below. Work on `main`.
- **Quality gates (every task):** `npm run lint`, `npm run typecheck`, and `npm run test` must pass clean; run `npm run build` at the final task. (Commands from CLAUDE.md.)
- **Contract layer:** components NEVER call `fetch`/`api` directly — only typed functions in `lib/api/*`. Shape mismatches are mapped in `lib/api/<domain>.ts`, never in components.
- **Security:** access token in memory only (never localStorage/sessionStorage); refresh token is the httpOnly cookie; requests use `credentials:'include'` (already handled by `lib/api/client.ts`). Only the WhatsApp `code` travels to the backend.
- **Design tokens, never hex literals** in components (`bg-primary`, `text-foreground`, …). Reuse shadcn/ui + `components/states/`.
- **Backend base path:** `lib/api/client.ts` prefixes `/api` and targets `NEXT_PUBLIC_API_URL`. New API functions go through `api.{get,post,patch,put,delete}`.
- **Tests use MSW** (`mocks/server.ts`, no default handlers — register per test). Never hit the real backend in tests.

## Backend contract this consumes (already built)

- `GET /api/auth/invite/validate/?token=` → `{valid: boolean}`
- `POST /api/auth/invite/accept/ {token, password}` → `{access_token, expires_in, token_type}` + sets refresh cookie
- `GET/POST /api/professionals/`, `PATCH/DELETE /api/professionals/{id}/`, `PUT /api/professionals/{id}/schedule/` (body: `[{day_of_week, start_time, end_time}]`)
- `PUT /api/businesses/me/schedule/` (same body) → `{professionals_updated}`
- `GET/POST /api/services/`, `DELETE /api/services/{id}/`
- `GET /api/users/`, `POST /api/users/ {email, role}`, `DELETE /api/users/{id}/`
- `PATCH /api/agents/{type}/ {is_active, autonomy}`, `GET /api/agents/`
- `POST /api/whatsapp/embedded-signup/callback/ {code}`
- `GET /api/businesses/me/onboarding/` → `{status, steps:[{key,label,completed}]}`
- `POST /api/businesses/me/onboarding/complete/` → `200` BusinessOut | `400 {missing_steps:[...]}`
- `PATCH /api/businesses/me/` (now WITHOUT client-writable status/onboarding_status)

---

### Task F1: Types + `lib/api/professionals.ts` (CRUD + schedule)

**Files:**
- Modify: `lib/types/` (add `Professional`, `ScheduleWindow`; export from the types barrel)
- Create: `lib/api/professionals.ts`
- Modify: `lib/api/index.ts` (re-export)
- Test: `lib/api/__tests__/professionals.test.ts`

**Interfaces:**
- Produces: `Professional {id:string; name:string; is_active:boolean}`, `ScheduleWindow {day_of_week:number; start_time:string; end_time:string}`
- Produces: `listProfessionals()`, `createProfessional({name})`, `updateProfessional(id,{name?,is_active?})`, `deleteProfessional(id)`, `putProfessionalSchedule(id, windows: ScheduleWindow[])`.

- [ ] **Step 1: Write the failing test** (MSW-backed)

```ts
// lib/api/__tests__/professionals.test.ts
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { createProfessional, listProfessionals, putProfessionalSchedule } from "@/lib/api/professionals";

const API = "http://localhost:8050/api";

describe("professionals api", () => {
  it("maps backend active->is_active on list", async () => {
    server.use(http.get(`${API}/professionals/`, () =>
      HttpResponse.json([{ id: 1, name: "Ana", active: true }]),
    ));
    const pros = await listProfessionals();
    expect(pros).toEqual([{ id: "1", name: "Ana", is_active: true }]);
  });

  it("sends name on create and maps the result", async () => {
    server.use(http.post(`${API}/professionals/`, async ({ request }) => {
      expect(await request.json()).toEqual({ name: "Ana", active: true });
      return HttpResponse.json({ id: 7, name: "Ana", active: true }, { status: 201 });
    }));
    expect(await createProfessional({ name: "Ana" })).toEqual({ id: "7", name: "Ana", is_active: true });
  });

  it("PUTs schedule windows as a list", async () => {
    server.use(http.put(`${API}/professionals/7/schedule/`, async ({ request }) => {
      expect(await request.json()).toEqual([{ day_of_week: 0, start_time: "09:00", end_time: "18:00" }]);
      return HttpResponse.json([{ day_of_week: 0, start_time: "09:00", end_time: "18:00" }]);
    }));
    const out = await putProfessionalSchedule("7", [{ day_of_week: 0, start_time: "09:00", end_time: "18:00" }]);
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test — FAIL** (`npm run test -- professionals` → module not found)

- [ ] **Step 3: Add the types** (in `lib/types/`, following the existing domain-type files; export from the barrel)

```ts
// lib/types/professional.ts  (or append to the appropriate existing types module + barrel)
export interface Professional {
  id: string;
  name: string;
  is_active: boolean;
}

export interface ScheduleWindow {
  day_of_week: number; // 0=Mon … 6=Sun
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
}
```

- [ ] **Step 4: Implement `lib/api/professionals.ts`** (mirror `lib/api/services.ts`'s backend-mapping style)

```ts
import type { Professional, ScheduleWindow } from "@/lib/types";
import { api } from "./client";

interface BackendProfessional { id: number; name: string; active: boolean }
const fromBackend = (p: BackendProfessional): Professional => ({ id: String(p.id), name: p.name, is_active: p.active });

export async function listProfessionals(): Promise<Professional[]> {
  return (await api.get<BackendProfessional[]>("/professionals/")).map(fromBackend);
}
export async function createProfessional(input: { name: string; is_active?: boolean }): Promise<Professional> {
  return fromBackend(await api.post<BackendProfessional>("/professionals/", { name: input.name, active: input.is_active ?? true }));
}
export async function updateProfessional(id: string, patch: { name?: string; is_active?: boolean }): Promise<Professional> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.is_active !== undefined) body.active = patch.is_active;
  return fromBackend(await api.patch<BackendProfessional>(`/professionals/${id}/`, body));
}
export function deleteProfessional(id: string): Promise<void> {
  return api.delete<void>(`/professionals/${id}/`);
}
export function putProfessionalSchedule(id: string, windows: ScheduleWindow[]): Promise<ScheduleWindow[]> {
  return api.put<ScheduleWindow[]>(`/professionals/${id}/schedule/`, windows);
}
```

- [ ] **Step 5: Re-export from `lib/api/index.ts`** (add the new module's exports alongside the others).
- [ ] **Step 6: Run test — PASS**.
- [ ] **Step 7: Checkpoint** — `npm run lint && npm run typecheck && npm run test -- professionals` clean.

---

### Task F2: `lib/api/users.ts` (system users) + `lib/api/businesses.ts` additions

**Files:**
- Create: `lib/api/users.ts`; Modify: `lib/types/` (add `SystemUser`), `lib/api/index.ts`, `lib/api/businesses.ts`
- Test: `lib/api/__tests__/users.test.ts`, extend `lib/api/__tests__/businesses.test.ts` (or create)

**Interfaces:**
- Produces: `SystemUser {id:string; email:string; role:"owner"|"staff"; is_active:boolean}`; `listUsers()`, `inviteUser({email, role})`, `deleteUser(id)`.
- Produces (businesses): `putBusinessSchedule(windows: ScheduleWindow[])`, `completeOnboarding(): Promise<{missing_steps?: string[]; ok: boolean}>`.

- [ ] **Step 1: Write failing tests**

```ts
// lib/api/__tests__/users.test.ts
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { inviteUser, listUsers } from "@/lib/api/users";
const API = "http://localhost:8050/api";

it("lists users mapping role/active", async () => {
  server.use(http.get(`${API}/users/`, () =>
    HttpResponse.json([{ id: 3, email: "a@b.cl", role: "staff", is_active: true }])));
  expect(await listUsers()).toEqual([{ id: "3", email: "a@b.cl", role: "staff", is_active: true }]);
});
it("invites a user (POST email+role)", async () => {
  server.use(http.post(`${API}/users/`, async ({ request }) => {
    expect(await request.json()).toEqual({ email: "x@y.cl", role: "staff" });
    return HttpResponse.json({ id: 9, email: "x@y.cl", role: "staff", is_active: true }, { status: 201 });
  }));
  expect((await inviteUser({ email: "x@y.cl", role: "staff" })).id).toBe("9");
});
```

```ts
// add to lib/api/__tests__/businesses.test.ts
it("completeOnboarding returns ok on 200", async () => {
  server.use(http.post(`${API}/businesses/me/onboarding/complete/`, () =>
    HttpResponse.json({ id: 1, name: "Acme", country:"CL", currency:"CLP", language:"es", timezone:"America/Santiago", active:true, onboarding_status:"completed", assistant_config:{} })));
  expect(await completeOnboarding()).toEqual({ ok: true });
});
it("completeOnboarding returns missing_steps on 400", async () => {
  server.use(http.post(`${API}/businesses/me/onboarding/complete/`, () =>
    HttpResponse.json({ missing_steps: ["whatsapp"] }, { status: 400 })));
  expect(await completeOnboarding()).toEqual({ ok: false, missing_steps: ["whatsapp"] });
});
```

- [ ] **Step 2: Run — FAIL**.
- [ ] **Step 3: `SystemUser` type** (lib/types + barrel): `{id:string; email:string; role:"owner"|"staff"; is_active:boolean}`.
- [ ] **Step 4: Implement `lib/api/users.ts`**

```ts
import type { SystemUser } from "@/lib/types";
import { api } from "./client";
interface BackendUser { id: number; email: string; role: "owner" | "staff"; is_active: boolean }
const fromBackend = (u: BackendUser): SystemUser => ({ id: String(u.id), email: u.email, role: u.role, is_active: u.is_active });
export async function listUsers(): Promise<SystemUser[]> {
  return (await api.get<BackendUser[]>("/users/")).map(fromBackend);
}
export async function inviteUser(input: { email: string; role: "owner" | "staff" }): Promise<SystemUser> {
  return fromBackend(await api.post<BackendUser>("/users/", { email: input.email, role: input.role }));
}
export function deleteUser(id: string): Promise<void> {
  return api.delete<void>(`/users/${id}/`);
}
```

- [ ] **Step 5: Extend `lib/api/businesses.ts`** — add `putBusinessSchedule` + `completeOnboarding`. `completeOnboarding` must catch `ApiError` 400 and return its `missing_steps`:

```ts
import { ApiError } from "./client";
import type { ScheduleWindow } from "@/lib/types";

export function putBusinessSchedule(windows: ScheduleWindow[]): Promise<{ professionals_updated: number }> {
  return api.put<{ professionals_updated: number }>("/businesses/me/schedule/", windows);
}

export async function completeOnboarding(): Promise<{ ok: boolean; missing_steps?: string[] }> {
  try {
    await api.post("/businesses/me/onboarding/complete/");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      const body = err.body as { missing_steps?: string[] } | null;
      return { ok: false, missing_steps: body?.missing_steps ?? [] };
    }
    throw err;
  }
}
```

- [ ] **Step 6: Re-export from `lib/api/index.ts`**. **Step 7: Run — PASS. Checkpoint** (lint+typecheck+test).

---

### Task F3: `lib/api/invite.ts` + AuthContext `acceptInvite`

**Files:**
- Create: `lib/api/invite.ts`; Modify: `lib/api/index.ts`, `lib/auth/AuthContext.tsx`, `lib/auth/useAuth.ts` (if it re-exports the type)
- Test: `lib/api/__tests__/invite.test.ts`, extend `lib/auth/__tests__/auth.test.tsx`

**Interfaces:**
- Produces (`lib/api/invite.ts`): `validateInvite(token): Promise<boolean>`; `acceptInvite(token, password): Promise<{access_token:string}>`.
- Produces (AuthContext): `acceptInvite(token: string, password: string): Promise<void>` on `AuthContextValue` — sets the in-memory token + loads the user (mirrors `login`).

- [ ] **Step 1: Failing test** for the api module:

```ts
// lib/api/__tests__/invite.test.ts
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { acceptInvite, validateInvite } from "@/lib/api/invite";
const API = "http://localhost:8050/api";
it("validateInvite returns the boolean", async () => {
  server.use(http.get(`${API}/auth/invite/validate/`, () => HttpResponse.json({ valid: true })));
  expect(await validateInvite("tok")).toBe(true);
});
it("acceptInvite posts token+password and returns access_token", async () => {
  server.use(http.post(`${API}/auth/invite/accept/`, async ({ request }) => {
    expect(await request.json()).toEqual({ token: "tok", password: "S3cret!!" });
    return HttpResponse.json({ access_token: "AAA", expires_in: 3600, token_type: "Bearer" });
  }));
  expect((await acceptInvite("tok", "S3cret!!")).access_token).toBe("AAA");
});
```

- [ ] **Step 2: Run — FAIL**.
- [ ] **Step 3: Implement `lib/api/invite.ts`** (validate uses `skipRefresh` is unnecessary; both are public `auth=None`. Pass the token as a query for validate.)

```ts
import { api } from "./client";
export async function validateInvite(token: string): Promise<boolean> {
  return (await api.get<{ valid: boolean }>("/auth/invite/validate/", { query: { token } })).valid;
}
export function acceptInvite(token: string, password: string): Promise<{ access_token: string; expires_in: number; token_type: string }> {
  // skipRefresh: a 400 here is "bad token/weak password", not an expired session.
  return api.post("/auth/invite/accept/", { token, password }, { skipRefresh: true });
}
```

- [ ] **Step 4: Add `acceptInvite` to AuthContext** (mirror `login` at AuthContext.tsx:89-104 — set token ref+state, then `getMe()` to populate the user; expose on the context value + interface):

```ts
// in AuthContextValue interface:
acceptInvite: (token: string, password: string) => Promise<void>;

// implementation (near login):
const acceptInvite = useCallback(async (token: string, password: string) => {
  const { access_token } = await apiAcceptInvite(token, password); // import { acceptInvite as apiAcceptInvite } from "@/lib/api/invite"
  tokenRef.current = access_token;
  setToken(access_token);
  try {
    const me = await getMe();
    setUser({ id: me.id, email: me.email, name: me.name });
  } catch {
    // identity will load later; session is established
  }
}, []);
// add `acceptInvite` to the useMemo value + deps.
```

- [ ] **Step 5: Test the AuthContext method** (extend `lib/auth/__tests__/auth.test.tsx`): render a probe that calls `acceptInvite`, MSW the accept + me endpoints, assert `status` becomes `"authenticated"`. Mirror the existing login test in that file.
- [ ] **Step 6: Run — PASS. Checkpoint**.

---

### Task F4: `/activar` set-password page

**Files:**
- Create: `app/activar/page.tsx`
- Test: `app/activar/__tests__/page.test.tsx` (or co-located per repo convention)

**Interfaces:**
- Consumes: `validateInvite` (api), `useAuth().acceptInvite`, `loginSchema`-style Zod (reuse a password schema), `next/navigation` router.

- [ ] **Step 1: Failing test** — render `/activar?token=tok`; MSW `validate` → true; fill password; submit; MSW `accept` → token; assert it navigates to `/onboarding`. And: `validate` → false renders an "invalid/expired link" message (no form). Use the login page test as the pattern; read `app/login/__tests__` for how `useAuth`/router are provided.

- [ ] **Step 2: Run — FAIL**.

- [ ] **Step 3: Implement `app/activar/page.tsx`** — a public client page mirroring `app/login/page.tsx` structure (BrandLogo, Card, RHF + Zod, ThemeToggle, BootSplash while validating). Behavior:
  - Read `token` from `useSearchParams()`. On mount, `validateInvite(token)`:
    - while validating → `<BootSplash />`;
    - invalid/empty → an `<ErrorState>`-style card: "El enlace de activación es inválido o expiró. Pide uno nuevo." (no form).
  - valid → render a "Crea tu contraseña" form (password + confirm; Zod: min length matching backend policy, passwords match). On submit → `useAuth().acceptInvite(token, password)` then `router.replace("/onboarding")`. On `ApiError` 400 → `setError("root", {message: err.message})` (surfaces the backend's weak-password message).
  - Use design tokens only; reuse `Card`, `Input`, `Label`, `Button`, `components/states`.

- [ ] **Step 4: Run — PASS. Checkpoint** (lint+typecheck+test).

---

### Task F5: Onboarding-aware routing (fix the orphaned wizard)

**Files:**
- Create: `lib/onboarding/use-onboarding-redirect.ts` (a small hook) OR a guard component `components/onboarding/onboarding-gate.tsx`
- Modify: `app/login/page.tsx` (post-login redirect), `app/page.tsx` (root), the authenticated `(app)` layout and the `(onboarding)` layout
- Test: `lib/onboarding/__tests__/use-onboarding-redirect.test.tsx`

**Interfaces:**
- Produces: a hook `useOnboardingRedirect()` that, for an authenticated user, calls `getOnboardingStatus()` once and returns `{ status: "loading" | "ready", target: "/onboarding" | "/dashboard" | null }`; `target` is `/onboarding` when `onboarding_status !== "completed"`, else null (stay).

- [ ] **Step 1: Failing test** — mock `getOnboardingStatus` (MSW) returning `status: "not_started"` → hook yields `target: "/onboarding"`; returning `"completed"` → `target: null`.

- [ ] **Step 2: Run — FAIL**.

- [ ] **Step 3: Implement the redirect logic.** The post-auth landing decision lives in ONE place. Recommended: a small client gate used by the authenticated area:
  - `app/login/page.tsx`: after `login(...)`, instead of always `router.replace("/dashboard")`, fetch `getOnboardingStatus()` and route to `/onboarding` if not completed, else `/dashboard`. (Keep it resilient: on fetch error default to `/dashboard`.)
  - `app/page.tsx`: convert to a client redirect that does the same status check (or redirect to a tiny client gate). Since it currently does a server `redirect("/dashboard")`, change it to render a client component that, once authenticated, applies `useOnboardingRedirect`.
  - `(onboarding)/layout.tsx`: after `RequireAuth`, if `onboarding_status === "completed"`, redirect to `/dashboard` (prevent re-running a finished wizard).
  - The authenticated `(app)` layout MAY optionally redirect an incomplete tenant to `/onboarding` (nice-to-have; at minimum login + root cover entry).

- [ ] **Step 4: Update `app/login/page.tsx`** post-login redirect to use the status check (replace the two `router.replace("/dashboard")` sites with the status-aware target; keep the "already authenticated" effect pointing through the same gate).

- [ ] **Step 5: Run — PASS. Checkpoint**. Manually note: a freshly-invited owner now lands at `/onboarding`, a finished one at `/dashboard`.

---

### Task F6: Wizard data model (`types.ts`) — 8 steps, server-shaped

**Files:**
- Modify: `lib/onboarding/types.ts`
- Remove: `lib/onboarding/templates.ts` (and any import of it)
- Test: `lib/onboarding/__tests__/types.test.ts` (light)

**Interfaces:**
- Produces: `OnboardingStep = 1..8`; `TOTAL_STEPS = 8`; `STEP_LABELS = {1:"Negocio",2:"Profesionales",3:"Horarios",4:"Servicios",5:"Usuarios",6:"WhatsApp",7:"Agentes",8:"Confirmar"}`. `OnboardingData` reshaped to: `businessName,country,currency,language,timezone`; `professionals: Professional[]`; `weeklySchedule: ScheduleWindow[]` (the business-level template) + optional per-pro overrides map; `services: Service[]`; `users: SystemUser[]`; `agents: Agent[]` (only available ones, hydrated from `GET /agents/`); `whatsappConnected/phoneNumberId/wabaId`. Drop `selectedTemplate`, `products`, `recordFields`, `activated`.

- [ ] **Step 1–4:** Rewrite the `OnboardingStep`/`TOTAL_STEPS`/`STEP_LABELS`/`OnboardingData`/`createEmptyOnboardingData` per the interface above; delete `templates.ts`; fix the now-broken imports (the context + step-2 will be rewritten in later tasks — it is fine for those to be temporarily red until their task runs, but DO keep `types.ts` itself compiling). A light test asserts `TOTAL_STEPS===8` and the labels. **Checkpoint:** `npm run typecheck` will surface every consumer that must change — note them for Tasks F7–F9 (expected).

> Because this task intentionally breaks consumers until F7–F9 land, run F6→F9 as a contiguous block; the suite returns to green at F9.

---

### Task F7: Onboarding context rewrite (server persistence + rehydration)

**Files:**
- Modify: `lib/onboarding/onboarding-context.tsx`
- Test: `lib/onboarding/__tests__/onboarding-context.test.tsx`

**Interfaces:**
- Produces a context that: on mount **rehydrates** from the server (`listProfessionals`, `listServices`, `listUsers`, `getAgents`, `getBusiness`) into `data` (loading state while fetching); exposes per-step mutators that **persist immediately** to the backend and update local state from the response; and `complete()` that calls `completeOnboarding()` and routes (`/dashboard` on ok; sets `completeError`/missing steps on 400).
- Mutators: `updateBusinessInfo` (→ `updateBusiness`), professionals add/update/remove (→ professionals api), `saveWeeklySchedule(windows)` (→ `putBusinessSchedule`), per-pro `saveProfessionalSchedule(id, windows)`, services add/update/remove (→ services api incl. new `deleteService`), users invite/remove (→ users api), agent toggle/autonomy (→ `updateAgent`), `setWhatsappConnected`. Remove all template/products/records logic and `sessionStorage`.

- [ ] **Step 1: Failing test** — with MSW stubbing the list endpoints, mount the provider via a probe component; assert it rehydrates (e.g. a seeded professional appears in `data.professionals`); call `addService` and assert it POSTs and appends the returned row; call `complete` with all-mocked-OK and assert it navigates to `/dashboard`. (Mock `next/navigation` router as the existing tests do.)

- [ ] **Step 2: Run — FAIL**.

- [ ] **Step 3: Rewrite `onboarding-context.tsx`.** Key structure:
  - `data` state shaped per F6; a `loading` boolean.
  - `useEffect` on mount: `Promise.all([listProfessionals(), listServices(), listUsers(), getAgents(), getBusiness()])` → seed `data` (map business fields → businessName/country/etc.; agents → only those returned by `GET /agents/`, which the backend already filters to available with `is_active` reflecting enabled). Set `loading=false`. On error, surface via an error state (reuse `ErrorState` at the page level).
  - Mutators call the api then `setData`. Examples:
    - `addProfessional(name)` → `createProfessional({name})` → append.
    - `removeProfessional(id)` → `deleteProfessional(id)` → filter.
    - `saveWeeklySchedule(windows)` → `putBusinessSchedule(windows)` → store `weeklySchedule`.
    - `addService(input)` → `createService(input)` → append; `removeService(id)` → `deleteService(id)` → filter.
    - `inviteUser({email,role})` → `inviteUser` → append; `removeUser(id)` → `deleteUser` → filter.
    - `toggleAgent(type, isActive)` / `setAgentAutonomy(type, autonomy)` → `updateAgent(type, …)` → update.
    - `setWhatsappConnected(phoneNumberId, wabaId)` → local state (the network call already happened in the step component).
  - `complete()` → `completeOnboarding()`; if `ok` → `router.push("/dashboard")`; else set `completeError` + `missingSteps` (UI maps these keys → step numbers to jump back).
  - Navigation: `goNext/goBack` clamped 1..8; `currentStep` may persist to `sessionStorage` for tab-local convenience ONLY (non-secret), but `data` comes from the server, not storage.

- [ ] **Step 4: Run — PASS. Checkpoint** (this task should bring typecheck back for the context).

---

### Task F8: Wizard shell — `page.tsx` + `stepper.tsx` (8 steps)

**Files:**
- Modify: `app/(onboarding)/onboarding/page.tsx`, `app/(onboarding)/onboarding/_components/stepper.tsx`
- Test: extend/replace `app/(onboarding)/onboarding/__tests__` if present

**Interfaces:**
- Consumes: the F7 context. Renders `Stepper` (8) + the current step component (switch 1..8) + Anterior/Siguiente nav with per-step validation; step 8 has no "Siguiente" (terminal — its own activate button). Shows a `loading` state while the context rehydrates.

- [ ] **Steps:** Update `TOTAL_STEPS` usage, the `switch` to map 1..8 to the new step components (Task F9), per-step `validateStep` (negocio: required fields; profesionales: ≥1; horarios: ≥1 day open; servicios: ≥1 valid; usuarios: none/optional; whatsapp: connected; agentes: none required; confirmar: none). Stepper renders 8 circles with `STEP_LABELS`. Render `<Loading>` while `loading`. Mirror the existing page/stepper structure. **Checkpoint** after F9 (page references the new step components).

---

### Task F9: Step components (build new, adapt kept, delete removed)

**Files:**
- Create: `_components/step-profesionales.tsx`, `_components/step-horarios.tsx`, `_components/step-usuarios.tsx`, `_components/step-confirmar.tsx`
- Modify/rename: `step-1-business-info.tsx` (keep), `step-3-services.tsx` → services step (keep/adapt to context API), `step-7-whatsapp.tsx` (keep), `step-6-agents.tsx` → agents step (adapt to available agents + `toggleAgent`/autonomy)
- Delete: `step-2-template.tsx`, `step-4-products.tsx`, `step-5-records.tsx`, `step-8-test.tsx`, `step-9-activation.tsx` (replaced by `step-confirmar.tsx`)
- Test: one RTL test per NEW step (profesionales, horarios, usuarios, confirmar)

**Interfaces / specs** (each is a client component consuming `useOnboarding()`; tokens only; reuse shadcn `Input/Select/Switch/Button` + `components/states`; mirror the kept steps for layout):

- **step-profesionales:** editable list of professionals (name). "Agregar profesional" → `addProfessional("")`; inline edit → `updateProfessional`; trash → `removeProfessional`. Validation (in page): ≥1 professional with a non-empty name. Mirror `step-3-services.tsx`'s list UX.
- **step-horarios (USER-FRIENDLY — the priority):** one weekly grid: 7 day rows (Lun–Dom), each with an open/closed `Switch` and, when open, one or more time ranges (start/end `Input type=time`), "+ agregar turno" for split shifts. Presets buttons: "Lun–Vie 9:00–18:00". A primary "Aplicar a todos los profesionales" saves via `saveWeeklySchedule(windows)`. An optional, collapsed "¿Algún profesional con horario distinto?" reveals per-professional editors calling `saveProfessionalSchedule(id, windows)`. Build `windows: ScheduleWindow[]` from the grid (one entry per open day per range). Validation: ≥1 day open with start<end. Keep it visually simple.
- **step-servicios:** adapt `step-3-services.tsx` to call the context's persisted `addService/updateService/removeService` (name, duration_minutes, price). Validation: ≥1 service, each with name + duration>0 + price≥0.
- **step-usuarios:** list current users (owner shown read-only) + "Invitar usuario" form (email + role select staff/owner) → `inviteUser`; trash → `removeUser` (guard: cannot remove the owner/self — backend returns 409, surface it). Optional step (can finish with only the owner).
- **step-whatsapp:** keep `step-7-whatsapp.tsx` as-is (Meta Embedded Signup → `submitEmbeddedSignupCode` → `setWhatsappConnected`).
- **step-agentes:** adapt `step-6-agents.tsx` to render ONLY the agents from the context (already limited to available); toggle active → `toggleAgent(type, active)`; autonomy select → `setAgentAutonomy`. Drop the template-seeding/skill-editing that relied on removed data (keep skills display read-only if present in the agent payload). Enabling is backend-guarded (403 if not entitled) — surface that error.
- **step-confirmar:** summary cards (business name, #professionals, #services, #users, WhatsApp connected?) + "Activar negocio" → `complete()`. On `missing_steps`, show which are missing and offer a button to jump to that step. Replaces step-8-test (mock) and step-9-activation.

- [ ] **Steps per component:** TDD where it carries logic (horarios window-building, confirmar missing-steps mapping, usuarios invite). For mechanical form steps, a render + key-interaction RTL test. Delete the four removed files and remove their imports/cases. **Run — PASS. Checkpoint** (lint+typecheck+test green; the whole wizard compiles).

---

### Task F10: Full verification

- [ ] **Step 1:** `npm run lint` — clean.
- [ ] **Step 2:** `npm run typecheck` — clean (no dangling refs to removed steps/templates/products/records).
- [ ] **Step 3:** `npm run test` — all green.
- [ ] **Step 4:** `npm run build` — succeeds.
- [ ] **Step 5:** Manual smoke note (cannot run backend here): the flow `/activar?token=…` → set password → `/onboarding` → steps persist → `Activar` → `/dashboard`.

---

## Self-review notes
- **Spec §3 coverage:** /activar (F4), routing/guards (F5), wizard refactor + rehydration + per-step persistence (F6–F9), schedules UX "aplicar a todos" (F9 step-horarios), removed template/products/records/test (F6, F9), stop sending active/onboarding_status (F7 uses `completeOnboarding`, not a status PATCH). API client functions (F1–F3).
- **Ordering risk:** F6 intentionally breaks consumers until F9; execute F6–F9 as a contiguous block and only judge the suite green at F9. Tasks F1–F5 are independently green.
- **Type consistency:** `Professional/ScheduleWindow/SystemUser` defined in F1/F2 and consumed by F7/F9; `completeOnboarding(): {ok, missing_steps?}` shape consistent F2↔F7↔F9; `acceptInvite` signature consistent F3 (api) ↔ F3 (AuthContext) ↔ F4 (page).
- **No commits** (per user); each task ends at the lint/typecheck/test checkpoint.
