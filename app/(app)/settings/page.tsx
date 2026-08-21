"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import {
  Bell,
  Bot,
  CalendarOff,
  Clock,
  MessageSquare,
  Store,
  Users,
} from "lucide-react";

import { NotificationSounds } from "./_components/notification-sounds";
import { TeamManagement } from "./_components/team-management";

import { SaveBar } from "@/components/save-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeekEditor } from "@/components/schedule/week-editor";
import { ProfessionalHours } from "@/components/schedule/professional-hours";
import { ScheduleBlocks } from "@/components/schedule/schedule-blocks";
import { ErrorState, Loading } from "@/components/states";
import {
  getBusinessConfig,
  getBusinessHours,
  putBusinessHours,
  updateBusiness,
  updateBusinessConfig,
} from "@/lib/api/businesses";
import { listTemplates, type WhatsAppTemplate } from "@/lib/api/whatsapp";
import { useBusiness } from "@/lib/business";
import { useSubmitGuard } from "@/lib/hooks/use-submit-guard";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { cn } from "@/lib/utils";
import {
  buildWindows,
  emptyWeek,
  validateWeek,
  windowsToWeek,
  type DayState,
} from "@/lib/schedule/windows";
import type { AssistantTone, Business, BusinessConfig } from "@/lib/types";
import { useSaveState } from "@/lib/hooks/use-save-state";

const COUNTRIES = [
  { code: "CL", label: "Chile", currency: "CLP", zone: "America/Santiago" },
  {
    code: "AR",
    label: "Argentina",
    currency: "ARS",
    zone: "America/Argentina/Buenos_Aires",
  },
  { code: "MX", label: "México", currency: "MXN", zone: "America/Mexico_City" },
  { code: "CO", label: "Colombia", currency: "COP", zone: "America/Bogota" },
  { code: "PE", label: "Perú", currency: "PEN", zone: "America/Lima" },
  { code: "VE", label: "Venezuela", currency: "VES", zone: "America/Caracas" },
  { code: "ES", label: "España", currency: "EUR", zone: "Europe/Madrid" },
  { code: "US", label: "Estados Unidos", currency: "USD", zone: "America/New_York" },
];

// Solo monedas dentro de los choices del backend:
// CLP, ARS, BOB, BRL, COP, MXN, PEN, PYG, USD, UYU, EUR, VES.
const CURRENCIES = [
  { code: "CLP", label: "CLP — Peso chileno" },
  { code: "ARS", label: "ARS — Peso argentino" },
  { code: "MXN", label: "MXN — Peso mexicano" },
  { code: "COP", label: "COP — Peso colombiano" },
  { code: "PEN", label: "PEN — Sol peruano" },
  { code: "VES", label: "VES — Bolívar venezolano" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "USD", label: "USD — Dólar" },
];

const LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "pt", label: "Portugués" },
];

const TONES: { value: AssistantTone; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "friendly", label: "Amigable" },
  { value: "casual", label: "Casual" },
];

/** Friendly labels for the standard templates; unknown catalog_key falls back to the raw name. */
const TEMPLATE_LABELS: Record<string, string> = {
  recordatorio_cita: "Recordatorio de cita",
  confirmacion_cita: "Confirmación de cita",
  seguimiento_conversacion: "Seguimiento de conversación",
};

const TEMPLATE_STATUS: Record<
  WhatsAppTemplate["status"],
  { label: string; variant: "success" | "secondary" | "destructive" }
> = {
  approved: { label: "Aprobada", variant: "success" },
  pending: { label: "En revisión", variant: "secondary" },
  rejected: { label: "Rechazada", variant: "destructive" },
};

/** The caps the backend enforces (apps/businesses/api.py: MAX_MESSAGE_LEN /
 * MAX_CONTEXT_LEN). Single-sourced here because the same numbers gate the save. */
const MAX_MESSAGE = 1000;
const MAX_CONTEXT = 4000;

/**
 * The config fields the "Mensajes de tu negocio" card OWNS, with each one's cap.
 *
 * `tone` and `welcome_message` are deliberately absent: they belong to the Asistente
 * card above and travel through `PATCH /businesses/me/`. Both cards write the same
 * config row, so sending the whole object from here wrote back the values loaded at
 * mount — silently undoing a tone change saved seconds earlier, two buttons apart in
 * the same tab (review 2026-07-27).
 *
 * It is also what keeps the PATCH body to what the tenant may write at all: the GET
 * returns the whole config row, and most of it is staff-only.
 */
const VOICE_MAX = {
  business_context: MAX_CONTEXT,
  fallback_message: MAX_MESSAGE,
  off_topic_message: MAX_MESSAGE,
  out_of_hours_message: MAX_MESSAGE,
  out_of_hours_ack_message: MAX_MESSAGE,
  human_handoff_message: MAX_MESSAGE,
  handoff_waiting_ack_message: MAX_MESSAGE,
  handoff_timeout_revert_message: MAX_MESSAGE,
} as const satisfies Partial<Record<keyof BusinessConfig, number>>;

type VoiceField = keyof typeof VOICE_MAX;

const VOICE_FIELDS = Object.keys(VOICE_MAX) as VoiceField[];

/**
 * The config fields the «Horario flexible» card (Horario tab) OWNS. Same config
 * row as the voice card, so the same rule applies: each card PATCHes only its own
 * fields (see VOICE_MAX for the incident that rule comes from).
 */
const SCHEDULING_FIELDS = ["flexible_scheduling", "closing_grace_minutes"] as const;

/** Labelled textarea with its hint and a live character counter.
 *
 * The label/hint/counter trio is repeated for every message the business writes,
 * and the counter matters here specifically: these fields are capped server-side,
 * and one of them (`business_context`) rides in every prompt. */
function MessageField({
  id,
  label,
  hint,
  value,
  onChange,
  max,
  rows = 2,
  placeholder,
  className,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  rows?: number;
  placeholder?: string;
  /** Colocación en el grid de la card (p. ej. `xl:col-span-2`), no estilo interno. */
  className?: string;
}) {
  // Only reachable with text that was already stored past the cap (staff can write
  // longer through the admin): typing is stopped by maxLength below.
  const over = value.length > max;
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span
          id={`${id}-count`}
          className={cn(
            "text-[0.7rem] tabular-nums",
            over ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {value.length}/{max}
        </span>
      </div>
      <p id={`${id}-hint`} className="text-[0.7rem] text-muted-foreground">
        {hint}
      </p>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        // Native cap, so the operator cannot type into a 422 whose message would
        // arrive as pydantic's English "String should have at most 1000 characters".
        maxLength={max}
        aria-invalid={over}
        // Hint and counter are announced with the field instead of only being visible.
        aria-describedby={`${id}-hint ${id}-count`}
      />
    </div>
  );
}

function SettingsContent() {
  // Shared business state (topbar badge + form data). Saving here only needs
  // to tell it to refetch so the badge reflects the new name/status without a
  // full reload; the form itself is hydrated once from ctx.business below.
  const {
    business: ctxBusiness,
    state: ctxState,
    error: ctxError,
    refetch: refetchBusinessCtx,
  } = useBusiness();
  // Solo ante un `false` explícito, igual que el menú: mientras el negocio carga
  // se muestran, porque esconderle pestañas a quien sí las tiene es peor que
  // mostrarlas un instante de más.
  const hasAssistant = ctxBusiness?.entitlements?.assistant !== false;

  // Guards the one-time form hydration below; a later ctx refetch (post-save)
  // must never re-trigger it, or the form would flash back to Loading.
  const [hydrated, setHydrated] = useState(false);

  // La sección activa vive en la URL (?tab=): recargar conserva la sección y un
  // enlace a /settings?tab=horario aterriza directo. Un valor desconocido — o uno
  // gated sin plan de asistente — cae a «negocio» sin normalizar la URL: al
  // siguiente clic `useUrlFilters` omite el default y la URL queda limpia sola.
  const [urlState, setUrl] = useUrlFilters({ tab: "negocio" });
  // OJO: todo TabsTrigger nuevo tiene que entrar TAMBIÉN aquí — «equipo» se
  // agregó sin esto y la pestaña quedó inalcanzable (el click caía a Negocio).
  const visibleTabs = hasAssistant
    ? [
        "negocio",
        "asistente",
        "horario",
        "profesionales",
        "bloqueos",
        "equipo",
        "notificaciones",
      ]
    : ["negocio", "horario", "profesionales", "bloqueos", "equipo"];
  const tab = visibleTabs.includes(urlState.tab) ? urlState.tab : "negocio";

  // La orientación de las tabs es responsive POR PROP, no por CSS: en Base UI la
  // prop gobierna las flechas del teclado (vertical = ↑/↓), así que una solución
  // solo-CSS dejaría el foco moviéndose en el eje equivocado. En <md se conserva
  // la lista horizontal scrolleable de siempre (QA 2026-07-30).
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    // 48rem y no 768px: el breakpoint md: de Tailwind v4 es 48rem, y en media
    // queries el rem resuelve contra la fuente base del usuario — con una fuente
    // agrandada por accesibilidad, px y rem divergen y la prop quedaría en una
    // orientación mientras las clases md: aplican la otra.
    const mq = window.matchMedia("(min-width: 48rem)");
    const sync = () => setIsDesktop(mq.matches);
    // Diferido (react-hooks/set-state-in-effect); llega antes del primer pintado
    // de las tabs, que esperan a la hidratación del formulario.
    const t = setTimeout(sync, 0);
    mq.addEventListener("change", sync);
    return () => {
      clearTimeout(t);
      mq.removeEventListener("change", sync);
    };
  }, []);

  // Business form
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [address, setAddress] = useState("");
  const [currency, setCurrency] = useState("");
  const [language, setLanguage] = useState("");
  const [timezone, setTimezone] = useState("");
  // One-shot hint: cambiar el país re-escribe moneda/tz; se avisa en la re-edición.
  const [autofillHint, setAutofillHint] = useState(false);

  // Assistant form (the assistant's language is inherited from the business)
  const [displayName, setDisplayName] = useState("");
  const [tone, setTone] = useState<AssistantTone>("casual");
  const [welcomeMessage, setWelcomeMessage] = useState("");

  // WhatsApp connection (read-only; configured during onboarding)
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");

  // Business opening hours (loaded/saved independently of the business form).
  const [hours, setHours] = useState<DayState[]>(emptyWeek());
  const [hoursLoaded, setHoursLoaded] = useState(false);

  // Per-section save state (one section = one save button, no global save).
  const biz = useSaveState();
  const asst = useSaveState();
  const hrs = useSaveState("No se pudo guardar el horario.");
  // The business's own voice (GET/PATCH /businesses/me/config/). Held as one object
  // instead of ten more useState pairs, with the loaded copy kept alongside so the
  // save button can tell "nothing changed" from "not saved yet".
  const [cfg, setCfg] = useState<BusinessConfig | null>(null);
  const [cfgLoaded, setCfgLoaded] = useState<BusinessConfig | null>(null);
  const cfgSave = useSaveState();
  // Scheduling-policy card (Horario tab) — same cfg object, its own save state.
  const schedSave = useSaveState("No se pudo guardar el horario flexible.");
  // El setter de useState es estable; el objeto del hook NO. La dependencia es
  // el setter: con el objeto, `loadCfg` se recrearía en cada render y su efecto
  // recargaría en bucle.
  const setCfgError = cfgSave.setError;
  // WhatsApp templates list (only relevant once whatsappConnected).
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templatesSynced, setTemplatesSynced] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const submitGuard = useSubmitGuard();

  function hydrateBusiness(b: Business) {
    setName(b.name);
    setCountry(b.country);
    setAddress(b.address);
    setCurrency(b.currency);
    setLanguage(b.language);
    setTimezone(b.timezone);
    setDisplayName(b.assistant_config.display_name);
    setTone(b.assistant_config.tone);
    setWelcomeMessage(b.assistant_config.welcome_message);
    setWhatsappConnected(b.whatsapp_connected);
    setWhatsappNumber(b.whatsapp_number);
  }

  // Huella de EXACTAMENTE los campos que hidrata el formulario. Detecta un
  // cambio hecho en otra sesión por VALOR, no por referencia: `Business` no
  // trae updated_at y cada guardado propio produce DOS ecos (el refetch directo
  // post-save y el refetch que dispara el negocio_actualizado del propio
  // PATCH), así que ni la identidad del objeto ni un consume-once sirven.
  // `is_operative` (el payload de negocio_actualizado) queda FUERA a propósito:
  // activar/desactivar el negocio no debe encender la franja.
  function serverSnapshot(b: Business): string {
    return JSON.stringify([
      b.name,
      b.country,
      b.address,
      b.currency,
      b.language,
      b.timezone,
      b.assistant_config.display_name,
      b.assistant_config.tone,
      b.assistant_config.welcome_message,
      b.whatsapp_connected,
      b.whatsapp_number,
    ]);
  }

  // Cambio REMOTO post-hidratación. `knownServer` son las huellas de TODOS los
  // estados del servidor que este formulario conoce (la hidratación y cada
  // guardado propio) — un CONJUNTO y no «la última» porque tras guardar, el
  // contexto sigue entregando el estado anterior hasta que su refetch aterriza:
  // comparar contra una sola huella encendía la franja con el propio guardado
  // (lo cazó el test del eco). Estado y no ref: react-hooks/immutability
  // prohíbe mutar refs desde handlers. Acotado a las últimas 4 entradas.
  const [remoteChange, setRemoteChange] = useState(false);
  const [knownServer, setKnownServer] = useState<string[]>([]);

  // Hydrate the forms once ctx.business is ready. Deferred setState
  // (react-hooks/set-state-in-effect); the `hydrated` guard means a later
  // ctx refetch (post-save) never re-runs this and never re-flashes Loading.
  useEffect(() => {
    if (hydrated || ctxState !== "ready" || !ctxBusiness) return;
    const t = setTimeout(() => {
      hydrateBusiness(ctxBusiness);
      setKnownServer([serverSnapshot(ctxBusiness)]);
      setHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, [hydrated, ctxState, ctxBusiness]);

  // Detector: el form no se re-hidrata solo (protege lo tipeado), pero avisar es
  // obligatorio — sin esto, un guardado aquí pisaba en silencio lo que otro
  // operador acababa de cambiar (auditoría 2026-08-20). Deferred setState, el
  // mismo idioma del resto del archivo.
  useEffect(() => {
    if (!hydrated || ctxState !== "ready" || !ctxBusiness) return;
    if (knownServer.length === 0) return;
    if (knownServer.includes(serverSnapshot(ctxBusiness))) return;
    const t = setTimeout(() => setRemoteChange(true), 0);
    return () => clearTimeout(t);
  }, [hydrated, ctxState, ctxBusiness, knownServer]);

  // Business opening hours load independently (not part of ctx.business).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      getBusinessHours()
        .then((windows) => {
          if (cancelled) return;
          if (windows.length > 0) setHours(windowsToWeek(windows));
          setHoursLoaded(true);
        })
        .catch(() => {
          // Non-fatal: start from an empty (always-open) week.
          if (!cancelled) setHoursLoaded(true);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  // The business's voice, same independent-load pattern as the opening hours.
  const loadCfg = useCallback(() => {
    setCfgError(null);
    return getBusinessConfig()
      .then((loaded) => {
        setCfg(loaded);
        setCfgLoaded(loaded);
      })
      .catch((e) => {
        setCfgError(
          e instanceof Error ? e.message : "No se pudieron cargar los mensajes.",
        );
      });
  }, [setCfgError]);

  useEffect(() => {
    const t = setTimeout(() => void loadCfg(), 0);
    return () => clearTimeout(t);
  }, [loadCfg]);

  const patchCfg = useCallback(
    <K extends keyof BusinessConfig>(field: K, value: BusinessConfig[K]) => {
      setCfg((prev) => (prev ? { ...prev, [field]: value } : prev));
    },
    [],
  );

  // Only the fields this card owns, and only the ones that actually changed. A whole-
  // object PATCH also wrote back `tone`/`welcome_message` from mount time, undoing the
  // Asistente card's save (see VOICE_MAX).
  const cfgChanges: Partial<BusinessConfig> =
    cfg === null || cfgLoaded === null
      ? {}
      : Object.fromEntries(
          VOICE_FIELDS.filter((key) => cfg[key] !== cfgLoaded[key]).map((key) => [
            key,
            cfg[key],
          ]),
        );
  const cfgDirty = Object.keys(cfgChanges).length > 0;
  // Only what is actually being SENT: text already stored past its cap (written from the
  // admin) would 422, but a field the PATCH does not carry cannot 422 — scanning all eight
  // locked the whole card over an untouched one.
  // String(): the voice diff only ever carries strings, but the Partial's value
  // union now includes the scheduling bool/int, which have no .length.
  const cfgOverLimit = Object.entries(cfgChanges).some(
    ([key, value]) => String(value ?? "").length > VOICE_MAX[key as VoiceField],
  );

  // After a save, fold ONLY the saving card's fields back into state. Feeding the
  // server's FULL row into `cfg` silently reverted the OTHER card's unsaved edits
  // (toggle flexible → save a voice message → the toggle snapped off: the server
  // still had flexible_scheduling=false). Same family as the 2026-07-27 clobber,
  // moved from the PATCH to local state (review 2026-08-15).
  const applySaved = useCallback(
    (saved: BusinessConfig, fields: readonly (keyof BusinessConfig)[]) => {
      const own = Object.fromEntries(fields.map((key) => [key, saved[key]]));
      setCfg((prev) => (prev ? { ...prev, ...own } : saved));
      setCfgLoaded((prev) => (prev ? { ...prev, ...own } : saved));
    },
    [],
  );

  const saveCfg = async () => {
    if (!cfg || !cfgDirty) return;
    await cfgSave.run(async () => {
      applySaved(await updateBusinessConfig(cfgChanges), VOICE_FIELDS);
    });
  };

  // The scheduling card's own diff over the same object: only its two fields, only
  // when they changed — so saving it can never drag voice edits along (nor the
  // reverse; the voice diff filters VOICE_FIELDS).
  const schedChanges: Partial<BusinessConfig> =
    cfg === null || cfgLoaded === null
      ? {}
      : Object.fromEntries(
          SCHEDULING_FIELDS.filter((key) => cfg[key] !== cfgLoaded[key]).map((key) => [
            key,
            cfg[key],
          ]),
        );
  const schedDirty = Object.keys(schedChanges).length > 0;

  const saveSched = async () => {
    if (!cfg || !schedDirty) return;
    await schedSave.run(async () => {
      applySaved(await updateBusinessConfig(schedChanges), SCHEDULING_FIELDS);
    });
  };

  // WhatsApp templates: loaded once the business is known to be connected.
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const { items, synced } = await listTemplates();
      setTemplates(items);
      setTemplatesSynced(synced);
    } catch (e) {
      setTemplatesError(
        e instanceof Error ? e.message : "No se pudieron cargar las plantillas.",
      );
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!whatsappConnected) return;
    // Deferred like the products loader (react-hooks/set-state-in-effect).
    const t = setTimeout(loadTemplates, 0);
    return () => clearTimeout(t);
  }, [whatsappConnected, loadTemplates]);

  const handleSaveNegocio = () => submitGuard(saveNegocio);

  /** «Recargar» de la franja de cambio remoto: descarta lo local, aplica el
   * estado del servidor y consume la marca. */
  function applyRemoteConfig() {
    if (ctxBusiness) {
      hydrateBusiness(ctxBusiness);
      setKnownServer([serverSnapshot(ctxBusiness)]);
    }
    setRemoteChange(false);
  }

  async function saveNegocio() {
    if (!name.trim()) {
      biz.setError("El nombre del negocio es obligatorio.");
      return;
    }
    if (!country) {
      biz.setError("Selecciona un país.");
      return;
    }
    await biz.run(async () => {
      const saved = await updateBusiness({
        name: name.trim(),
        country,
        address: address.trim(),
        currency,
        language,
        timezone,
      });
      // ANTES del refetch: sus dos ecos (directo + SSE) llegan con este mismo
      // estado y no deben encender la franja de «cambió en otra sesión».
      setKnownServer((prev) => [...prev.slice(-3), serverSnapshot(saved)]);
      refetchBusinessCtx();
    });
  }

  async function handleSaveAsistente() {
    await asst.run(async () => {
      const saved = await updateBusiness({
        assistant_config: {
          display_name: displayName.trim(),
          tone,
          welcome_message: welcomeMessage.trim(),
        },
      });
      setKnownServer((prev) => [...prev.slice(-3), serverSnapshot(saved)]);
      refetchBusinessCtx();
    });
  }

  async function handleSaveHours() {
    const invalid = validateWeek(hours);
    if (invalid) {
      hrs.setError(invalid);
      return;
    }
    await hrs.run(async () => {
      // Empty windows are valid: they mean "sin horario" → always open.
      const saved = await putBusinessHours(buildWindows(hours));
      setHours(windowsToWeek(saved));
    });
  }

  // Un valor guardado fuera de catálogo se agrega como ítem {value, label: value}:
  // el trigger siempre muestra algo y el valor no se pierde al re-guardar.
  const countryItems =
    !country || COUNTRIES.some((c) => c.code === country)
      ? COUNTRIES
      : [...COUNTRIES, { code: country, label: country }];
  const currencyItems =
    !currency || CURRENCIES.some((c) => c.code === currency)
      ? CURRENCIES
      : [...CURRENCIES, { code: currency, label: currency }];

  // Sin max-w, como /reports: con la nav lateral, el panel absorbe el ancho
  // del main y no quedan franjas vacías a los costados en pantallas anchas.
  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Configuración
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configura tu negocio y asistente. Cada sección se guarda por separado.
        </p>
      </div>

      {/* La cabecera se dibuja también durante la carga (patrón de /reports):
          reemplazar la página entera por el cargador desmonta el control recién
          usado y tira el foco al body. El gate solo aplica hasta hidratar; un
          refetch del ctx posterior (post-guardado) nunca vuelve a mostrarlo. */}
      {!hydrated ? (
        ctxError ? (
          <ErrorState description={ctxError} onRetry={refetchBusinessCtx} />
        ) : (
          <Loading rows={6} label="Cargando configuración…" />
        )
      ) : (
        <>
          {/* Cambio remoto detectado: se AVISA, nunca se re-hidrata solo — lo
              tipeado manda hasta que el operador decida. Recargar descarta lo
              local y aplica el estado del servidor. */}
          {remoteChange && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
            >
              <span>
                La configuración cambió en otra sesión. Recargar descarta tus ediciones
                sin guardar.
              </span>
              <Button size="sm" variant="outline" onClick={applyRemoteConfig}>
                Recargar
              </Button>
            </div>
          )}
          <Tabs
            orientation={isDesktop ? "vertical" : "horizontal"}
            value={tab}
            onValueChange={(value) => setUrl({ tab: String(value) })}
            className="gap-6 md:gap-10"
          >
            {/* Dos de las seis secciones solo tienen sentido con asistente: la voz
            que usa (con su canal de WhatsApp como card, no como sección: no tiene
            ni un control editable) y los sonidos de sus avisos. Sin plan que lo
            incluya se ocultan. En md+ la lista es una nav lateral pegajosa
            (variante line = indicador lateral); en móvil, las pills de siempre. */}
            <TabsList
              variant={isDesktop ? "line" : "default"}
              className="md:sticky md:top-24 md:w-52 md:shrink-0 md:self-start"
            >
              <TabsTrigger value="negocio" className="md:px-3 md:py-2">
                <Store /> Negocio
              </TabsTrigger>
              {hasAssistant && (
                <TabsTrigger value="asistente" className="md:px-3 md:py-2">
                  <Bot /> Asistente
                </TabsTrigger>
              )}
              <TabsTrigger value="horario" className="md:px-3 md:py-2">
                <Clock /> Horario
              </TabsTrigger>
              <TabsTrigger value="profesionales" className="md:px-3 md:py-2">
                <Users /> Por profesional
              </TabsTrigger>
              <TabsTrigger value="bloqueos" className="md:px-3 md:py-2">
                <CalendarOff /> Bloqueos
              </TabsTrigger>
              <TabsTrigger value="equipo" className="md:px-3 md:py-2">
                <Users /> Equipo
              </TabsTrigger>
              {hasAssistant && (
                <TabsTrigger value="notificaciones" className="md:px-3 md:py-2">
                  <Bell /> Notificaciones
                </TabsTrigger>
              )}
            </TabsList>

            {/* ── Negocio ─────────────────────────────────────────────── */}
            <TabsContent value="negocio" className="min-w-0">
              <Card>
                <CardHeader>
                  <CardTitle>Datos del negocio</CardTitle>
                  <CardDescription>Información básica de tu negocio.</CardDescription>
                </CardHeader>
                {/* Dos columnas desde xl (no md: con el sidebar, en lg el panel cae a
                ~416px y dos columnas serían ilegibles). Dirección va a ancho
                completo por su hint de dos líneas. */}
                <CardContent className="grid gap-y-5 xl:grid-cols-2 xl:gap-x-6">
                  <div className="space-y-2">
                    <Label htmlFor="biz-name">Nombre</Label>
                    <Input
                      id="biz-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nombre del negocio"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="biz-country">País</Label>
                    <Select
                      items={countryItems.map((c) => ({
                        value: c.code,
                        label: c.label,
                      }))}
                      value={country}
                      onValueChange={(v) => {
                        const selected = v ?? country;
                        setCountry(selected);
                        const c = COUNTRIES.find((x) => x.code === selected);
                        if (c) {
                          setCurrency(c.currency);
                          setTimezone(c.zone);
                          setAutofillHint(true);
                        }
                      }}
                    >
                      <SelectTrigger id="biz-country" className="w-full">
                        <SelectValue placeholder="Selecciona un país" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {countryItems.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {autofillHint && (
                      <p className="text-[0.7rem] text-muted-foreground">
                        Se actualizaron la moneda y la zona horaria según el país.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 xl:col-span-2">
                    <Label htmlFor="biz-address">Dirección</Label>
                    <Input
                      id="biz-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Dirección de la tienda (opcional)"
                    />
                    <p className="text-[0.7rem] text-muted-foreground">
                      El asistente la usa para responder «¿dónde están?». Si la dejas
                      vacía, dirá que el equipo la confirmará.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="biz-currency">Moneda</Label>
                    <Select
                      items={currencyItems.map((c) => ({
                        value: c.code,
                        label: c.label,
                      }))}
                      value={currency}
                      onValueChange={(v) => setCurrency(v ?? currency)}
                    >
                      <SelectTrigger id="biz-currency" className="w-full">
                        <SelectValue placeholder="Moneda" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {currencyItems.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="biz-language">Idioma del negocio</Label>
                    <Select
                      items={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                      value={language}
                      onValueChange={(v) => setLanguage(v ?? language)}
                    >
                      <SelectTrigger id="biz-language" className="w-full">
                        <SelectValue placeholder="Idioma" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {LANGUAGES.map((l) => (
                            <SelectItem key={l.code} value={l.code}>
                              {l.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="biz-timezone">Zona horaria</Label>
                    <Input id="biz-timezone" value={timezone} disabled readOnly />
                    <p className="text-[0.7rem] text-muted-foreground">
                      Se ajusta automáticamente según el país.
                    </p>
                  </div>

                  <SaveBar
                    label="Guardar negocio"
                    onSave={handleSaveNegocio}
                    saving={biz.saving}
                    saved={biz.saved}
                    error={biz.error}
                    className="xl:col-span-2"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Asistente ───────────────────────────────────────────── */}
            {/* Cards apiladas a ancho completo, no lado a lado: «Mensajes» mide ~4×
            «Asistente IA» y en paralelo dejan un pozo blanco. El ancho se
            aprovecha DENTRO de cada card con grids de dos columnas. */}
            <TabsContent value="asistente" className="min-w-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Asistente IA</CardTitle>
                  <CardDescription>
                    Configura cómo se comporta tu asistente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-y-5 xl:grid-cols-2 xl:gap-x-6">
                  <div className="space-y-2">
                    <Label htmlFor="asst-name">Nombre del asistente</Label>
                    <Input
                      id="asst-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Maya"
                    />
                    <p className="text-[0.7rem] text-muted-foreground">
                      Tu asistente se presentará con este nombre en el chat (ej.: «Hola,
                      soy Maya»). El nombre del negocio se toma de la pestaña «Negocio».
                      Esto no cambia el nombre de contacto que se ve en WhatsApp (ese se
                      configura en Meta).
                    </p>
                    {!displayName.trim() && (
                      <p className="text-[0.7rem] text-muted-foreground">
                        Si lo dejas vacío, el asistente no se presenta con un nombre
                        propio: responde directamente en nombre del negocio.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="asst-tone">Tono</Label>
                    <Select
                      items={TONES}
                      value={tone}
                      onValueChange={(v) => setTone(v as AssistantTone)}
                    >
                      <SelectTrigger id="asst-tone" className="w-full">
                        <SelectValue placeholder="Tono" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {TONES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <p className="text-[0.7rem] text-muted-foreground">
                      El asistente responde en el idioma del negocio (lo defines en la
                      pestaña «Negocio»).
                    </p>
                  </div>

                  <div className="space-y-2 xl:col-span-2">
                    <Label htmlFor="asst-welcome">Mensaje de bienvenida</Label>
                    <p className="text-[0.7rem] text-muted-foreground">
                      Es lo primero que tu asistente responde cuando un cliente te
                      escribe por primera vez. Si lo dejas vacío, usaremos uno por
                      defecto.{" "}
                      <span className="italic">
                        Ejemplo: «¡Hola! Soy el asistente de tu negocio. ¿En qué puedo
                        ayudarte hoy?»
                      </span>
                    </p>
                    {/* max-w-2xl: a ancho completo del panel (~900px) la línea pasa
                    de 120 caracteres y deja de ser legible. */}
                    <Textarea
                      id="asst-welcome"
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      placeholder="¡Hola! Gracias por escribir. ¿En qué puedo ayudarte hoy?"
                      rows={3}
                      className="max-w-2xl"
                    />
                  </div>

                  <SaveBar
                    label="Guardar asistente"
                    onSave={handleSaveAsistente}
                    saving={asst.saving}
                    saved={asst.saved}
                    error={asst.error}
                    className="xl:col-span-2"
                  />
                </CardContent>
              </Card>

              {/* Sobre tu negocio + los mensajes que lee el cliente. Una sola tarjeta y
              un solo guardado: son el mismo endpoint y el mismo acto («cómo habla mi
              negocio»), separarlos obligaba a cazar dos botones. */}
              <Card>
                <CardHeader>
                  <CardTitle>Mensajes de tu negocio</CardTitle>
                  <CardDescription>
                    Lo que tus clientes leen. Puedes dejar cualquiera vacío: en ese caso
                    usamos un texto estándar, nunca quedan sin respuesta.
                  </CardDescription>
                </CardHeader>
                {/* Los 7 mensajes cortos van a dos columnas desde xl: una celda mide
                ~440px ≈ 63 caracteres por línea (legible); a ancho completo serían
                ~128 y la vista, una torre de 8 textareas. El contexto —el campo
                largo— sí ocupa las dos columnas. El 7º queda impar a propósito:
                estirarlo rompería el ritmo de anchos de lectura. */}
                <CardContent className="grid gap-y-5 xl:grid-cols-2 xl:gap-x-6">
                  {cfg === null && cfgSave.error ? (
                    <ErrorState description={cfgSave.error} onRetry={loadCfg} />
                  ) : cfg === null ? (
                    <Loading rows={4} label="Cargando mensajes…" />
                  ) : (
                    <>
                      <MessageField
                        id="cfg-context"
                        label="Sobre tu negocio"
                        hint="Qué ofreces, qué te diferencia y los detalles que tus clientes suelen preguntar. Lo usamos para responderles mejor."
                        value={cfg.business_context}
                        onChange={(v) => patchCfg("business_context", v)}
                        max={MAX_CONTEXT}
                        rows={6}
                        placeholder="Somos una barbería en el centro. Atendemos sin reserva de lunes a viernes…"
                        className="xl:col-span-2"
                      />

                      <Separator className="xl:col-span-2" />

                      <MessageField
                        id="cfg-fallback"
                        label="Cuando no logra ayudar"
                        hint="Se envía si el asistente no puede resolver la consulta."
                        value={cfg.fallback_message}
                        onChange={(v) => patchCfg("fallback_message", v)}
                        max={MAX_MESSAGE}
                      />
                      <MessageField
                        id="cfg-off-topic"
                        label="Consultas fuera de tu rubro"
                        hint="Cuando te preguntan algo que tu negocio no hace."
                        value={cfg.off_topic_message}
                        onChange={(v) => patchCfg("off_topic_message", v)}
                        max={MAX_MESSAGE}
                      />
                      <MessageField
                        id="cfg-ooh"
                        label="Fuera de horario"
                        hint="Aviso cuando te escriben con el local cerrado."
                        value={cfg.out_of_hours_message}
                        onChange={(v) => patchCfg("out_of_hours_message", v)}
                        max={MAX_MESSAGE}
                      />
                      <MessageField
                        id="cfg-ooh-ack"
                        label="Fuera de horario (mensajes siguientes)"
                        hint="Respuesta breve si te siguen escribiendo mientras está cerrado."
                        value={cfg.out_of_hours_ack_message}
                        onChange={(v) => patchCfg("out_of_hours_ack_message", v)}
                        max={MAX_MESSAGE}
                      />
                      <MessageField
                        id="cfg-handoff"
                        label="Al pasar con una persona"
                        hint="Se envía en el momento en que la conversación queda en manos de tu equipo."
                        value={cfg.human_handoff_message}
                        onChange={(v) => patchCfg("human_handoff_message", v)}
                        max={MAX_MESSAGE}
                      />
                      <MessageField
                        id="cfg-waiting"
                        label="Mientras espera a tu equipo"
                        hint="Si el cliente insiste antes de que alguien tome la conversación."
                        value={cfg.handoff_waiting_ack_message}
                        onChange={(v) => patchCfg("handoff_waiting_ack_message", v)}
                        max={MAX_MESSAGE}
                      />
                      <MessageField
                        id="cfg-revert"
                        label="Cuando el asistente retoma"
                        hint="Si nadie de tu equipo respondió, el asistente vuelve a atender y lo avisa."
                        value={cfg.handoff_timeout_revert_message}
                        onChange={(v) => patchCfg("handoff_timeout_revert_message", v)}
                        max={MAX_MESSAGE}
                      />

                      <SaveBar
                        label="Guardar mensajes"
                        onSave={saveCfg}
                        saving={cfgSave.saving}
                        saved={cfgSave.saved}
                        error={cfgSave.error}
                        disabled={!cfgDirty || cfgOverLimit}
                        className="xl:col-span-2"
                      />
                    </>
                  )}
                </CardContent>
              </Card>
              {/* Antes era una pestaña propia; sin un solo control editable era un
              callejón sin salida (la conexión se hace en el alta, no aquí). Vive
              con el asistente porque es SU canal y comparten gate de plan. */}
              <Card>
                <CardHeader>
                  <CardTitle>Canal WhatsApp</CardTitle>
                  <CardDescription>
                    Estado de la conexión y plantillas aprobadas por Meta.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 rounded-lg border border-border/40 px-4 py-3">
                    <MessageSquare className="size-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">WhatsApp Business API</p>
                      <p className="text-xs text-muted-foreground">
                        {whatsappConnected
                          ? whatsappNumber
                            ? `Número vinculado: ${whatsappNumber}`
                            : "Tu cuenta de WhatsApp Business está conectada."
                          : "La conexión se configura durante el onboarding."}
                      </p>
                    </div>
                    <Badge
                      variant={whatsappConnected ? "success" : "secondary"}
                      className="text-xs"
                    >
                      {whatsappConnected ? "Conectado" : "No conectado"}
                    </Badge>
                  </div>

                  {whatsappConnected && (
                    <div className="mt-4 space-y-2">
                      <div className="space-y-1 text-[0.7rem] text-muted-foreground">
                        <p>
                          WhatsApp exige plantillas pre-aprobadas por Meta para que tu
                          asistente pueda iniciar mensajes (recordatorios y avisos
                          automáticos fuera de la ventana de 24 horas). Las tres
                          plantillas estándar se crean automáticamente al conectar tu
                          cuenta de WhatsApp.
                        </p>
                        <ul className="list-disc space-y-0.5 pl-4">
                          <li>
                            <span className="font-medium">Recordatorio de cita</span>:
                            aviso previo con el servicio, lugar, fecha y hora.
                          </li>
                          <li>
                            <span className="font-medium">Confirmación de cita</span>:
                            pide confirmar o cancelar con botones de respuesta rápida.
                          </li>
                          <li>
                            <span className="font-medium">
                              Seguimiento de conversación
                            </span>
                            : retoma un chat que quedó sin respuesta.
                          </li>
                        </ul>
                      </div>

                      {templatesLoading && templates.length === 0 && (
                        <p className="pt-2 text-xs text-muted-foreground">
                          Cargando plantillas…
                        </p>
                      )}
                      {/* Son fichas de estado, no texto corrido: en xl van en fila. */}
                      {templates.length > 0 && (
                        <div className="grid gap-2 pt-2 xl:grid-cols-3">
                          {templates.map((t) => {
                            const label = TEMPLATE_LABELS[t.catalog_key] ?? t.name;
                            const status = TEMPLATE_STATUS[t.status];
                            return (
                              <div
                                key={t.name}
                                className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2"
                              >
                                <div>
                                  <p className="text-sm">{label}</p>
                                  {t.name !== label && (
                                    <p className="text-xs text-muted-foreground">
                                      {t.name}
                                    </p>
                                  )}
                                </div>
                                <Badge variant={status.variant} className="text-xs">
                                  {status.label}
                                </Badge>
                              </div>
                            );
                          })}
                          {!templatesSynced && (
                            <p className="text-[0.7rem] text-muted-foreground xl:col-span-3">
                              No se pudo actualizar el estado desde Meta; mostrando el
                              último conocido.
                            </p>
                          )}
                        </div>
                      )}
                      {templatesError && (
                        <p className="text-xs text-destructive">{templatesError}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Horario ─────────────────────────────────────────────── */}
            {/* Editor a la izquierda, política a la derecha: el WeekEditor no se
            beneficia del ancho (sus filas son etiqueta y switch a los extremos) y
            el horario flexible califica exactamente a estas horas. */}
            <TabsContent
              value="horario"
              className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
            >
              <Card>
                <CardHeader>
                  <CardTitle>Horario de atención</CardTitle>
                  <CardDescription>
                    Define cuándo está abierto tu negocio. Fuera de este horario, el
                    asistente responde con tu mensaje de «fuera de horario» y no se
                    ofrecen citas. Si lo dejas todo cerrado, se atiende siempre.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!hoursLoaded ? (
                    <Loading rows={3} label="Cargando horario…" />
                  ) : (
                    <>
                      <WeekEditor week={hours} onChange={setHours} />
                      <SaveBar
                        label="Guardar horario"
                        onSave={handleSaveHours}
                        saving={hrs.saving}
                        saved={hrs.saved}
                        error={hrs.error}
                      />
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Política sobre esas mismas horas. Misma fila de config que la card de
              «Mensajes» (sección Asistente): cada card PATCHea solo sus campos
              (ver VOICE_MAX / SCHEDULING_FIELDS). */}
              <Card>
                <CardHeader>
                  <CardTitle>Horario flexible</CardTitle>
                  <CardDescription>
                    Permite que tus clientes propongan su propia hora al agendar por
                    WhatsApp, dentro de tu horario de atención y sin chocar con otras
                    citas.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Load failures land in cfgSave.error (loadCfg's alias) — schedSave
                  only ever holds SAVE errors, which require cfg to exist. */}
                  {cfg === null && cfgSave.error ? (
                    <ErrorState description={cfgSave.error} onRetry={loadCfg} />
                  ) : cfg === null ? (
                    <Loading rows={2} label="Cargando horario flexible…" />
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <Label htmlFor="sched-flexible">
                            Aceptar horas propuestas por el cliente
                          </Label>
                          <p
                            id="sched-flexible-hint"
                            className="text-[0.7rem] text-muted-foreground"
                          >
                            Si lo apagas, solo se ofrecen los horarios exactos de la
                            agenda.
                          </p>
                        </div>
                        <Switch
                          id="sched-flexible"
                          aria-describedby="sched-flexible-hint"
                          checked={cfg.flexible_scheduling}
                          onChange={(checked) =>
                            patchCfg("flexible_scheduling", checked)
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="sched-grace">Holgura de cierre (minutos)</Label>
                        <Input
                          id="sched-grace"
                          type="number"
                          min={0}
                          className="max-w-32"
                          value={cfg.closing_grace_minutes}
                          disabled={!cfg.flexible_scheduling}
                          aria-describedby="sched-grace-hint"
                          onChange={(e) => {
                            const n =
                              e.target.value === "" ? 0 : Number(e.target.value);
                            if (Number.isFinite(n) && n >= 0) {
                              patchCfg("closing_grace_minutes", Math.trunc(n));
                            }
                          }}
                        />
                        <p
                          id="sched-grace-hint"
                          className="text-[0.7rem] text-muted-foreground"
                        >
                          Cuántos minutos puede terminar un servicio después de la hora
                          de cierre. 0 = el servicio debe terminar dentro del horario.
                        </p>
                      </div>

                      <SaveBar
                        label="Guardar horario flexible"
                        onSave={saveSched}
                        saving={schedSave.saving}
                        saved={schedSave.saved}
                        error={schedSave.error}
                        disabled={!schedDirty}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Por profesional ─────────────────────────────────────── */}
            {/* Horario propio de cada profesional. El backend lo expone desde
            siempre; hasta ahora el único consumidor era el asistente de alta,
            así que después del alta no había forma de cambiarlo.
            keepMounted: su estado (selección + grilla editada, p. ej. tras
            «Copiar el horario de la tienda») vive DENTRO del componente y el
            panel inactivo se desmonta por defecto — sin esto, un paseo por
            «Horario» para comparar descartaba las ediciones en silencio. Es la
            misma garantía que el estado lifted da al resto de secciones. */}
            <TabsContent value="profesionales" keepMounted className="min-w-0">
              <ProfessionalHours />
            </TabsContent>

            {/* ── Bloqueos ────────────────────────────────────────────── */}
            <TabsContent value="bloqueos" className="min-w-0">
              <ScheduleBlocks />
            </TabsContent>

            {/* ── Notificaciones ──────────────────────────────────────── */}
            {/* ── Equipo ─────────────────────────────────────────────── */}
            <TabsContent value="equipo" className="min-w-0">
              <Card>
                <CardHeader>
                  <CardTitle>Equipo</CardTitle>
                  <CardDescription>
                    Quién tiene acceso al panel. Los asientos de tu plan son las
                    personas activas: desactivar a alguien libera su asiento.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TeamManagement />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notificaciones" className="min-w-0">
              <Card>
                <CardHeader>
                  <CardTitle>Sonidos de notificación</CardTitle>
                  <CardDescription>
                    Un sonido distinto para cada aviso, para reconocerlos sin mirar la
                    pantalla. Se guarda en este navegador.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <NotificationSounds />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

// `useSearchParams` (dentro de `useUrlFilters`) exige un `<Suspense>` en el App
// Router — el mismo que ya envuelve reportes, pagos, clientes y conversaciones.
export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading rows={6} label="Cargando configuración…" />}>
      <SettingsContent />
    </Suspense>
  );
}
