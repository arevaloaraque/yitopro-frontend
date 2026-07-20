"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, MessageSquare, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeekEditor } from "@/components/schedule/week-editor";
import { ScheduleBlocks } from "@/components/schedule/schedule-blocks";
import { ErrorState, Loading } from "@/components/states";
import {
  getBusinessHours,
  putBusinessHours,
  updateBusiness,
} from "@/lib/api/businesses";
import { listTemplates, type WhatsAppTemplate } from "@/lib/api/whatsapp";
import { useBusiness } from "@/lib/business";
import { useSubmitGuard } from "@/lib/hooks/use-submit-guard";
import {
  buildWindows,
  emptyWeek,
  validateWeek,
  windowsToWeek,
  type DayState,
} from "@/lib/schedule/windows";
import type { AssistantTone, Business } from "@/lib/types";

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

/** Per-section save action: one button saves exactly the section it lives in. */
function SaveBar({
  label,
  onSave,
  saving,
  saved,
  error,
}: {
  label: string;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  error: string | null;
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <Button variant="outline" onClick={onSave} disabled={saving}>
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        {label}
      </Button>
      {saved && (
        <span className="flex items-center gap-1 text-sm text-success">
          <Check className="size-4" />
          Guardado
        </span>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export default function SettingsPage() {
  // Shared business state (topbar badge + form data). Saving here only needs
  // to tell it to refetch so the badge reflects the new name/status without a
  // full reload; the form itself is hydrated once from ctx.business below.
  const {
    business: ctxBusiness,
    state: ctxState,
    error: ctxError,
    refetch: refetchBusinessCtx,
  } = useBusiness();

  // Guards the one-time form hydration below; a later ctx refetch (post-save)
  // must never re-trigger it, or the form would flash back to Loading.
  const [hydrated, setHydrated] = useState(false);

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
  const [bizSaving, setBizSaving] = useState(false);
  const [bizSaved, setBizSaved] = useState(false);
  const [bizError, setBizError] = useState<string | null>(null);
  const [asstSaving, setAsstSaving] = useState(false);
  const [asstSaved, setAsstSaved] = useState(false);
  const [asstError, setAsstError] = useState<string | null>(null);
  const [savingHours, setSavingHours] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);
  // WhatsApp templates list (only relevant once whatsappConnected).
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templatesSynced, setTemplatesSynced] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  // Separate "Guardado" auto-clear timers so one section doesn't clear another.
  const bizTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const submitGuard = useSubmitGuard();
  const asstTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const hoursTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(
    () => () => {
      [bizTimer, asstTimer, hoursTimer].forEach((t) => {
        if (t.current) clearTimeout(t.current);
      });
    },
    [],
  );

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

  // Hydrate the forms once ctx.business is ready. Deferred setState
  // (react-hooks/set-state-in-effect); the `hydrated` guard means a later
  // ctx refetch (post-save) never re-runs this and never re-flashes Loading.
  useEffect(() => {
    if (hydrated || ctxState !== "ready" || !ctxBusiness) return;
    const t = setTimeout(() => {
      hydrateBusiness(ctxBusiness);
      setHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, [hydrated, ctxState, ctxBusiness]);

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

  async function saveNegocio() {
    if (!name.trim()) {
      setBizError("El nombre del negocio es obligatorio.");
      return;
    }
    if (!country) {
      setBizError("Selecciona un país.");
      return;
    }
    setBizSaving(true);
    setBizError(null);
    setBizSaved(false);
    try {
      await updateBusiness({
        name: name.trim(),
        country,
        address: address.trim(),
        currency,
        language,
        timezone,
      });
      refetchBusinessCtx();
      setBizSaved(true);
      if (bizTimer.current) clearTimeout(bizTimer.current);
      bizTimer.current = setTimeout(() => setBizSaved(false), 2500);
    } catch (e) {
      setBizError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBizSaving(false);
    }
  }

  async function handleSaveAsistente() {
    setAsstSaving(true);
    setAsstError(null);
    setAsstSaved(false);
    try {
      await updateBusiness({
        assistant_config: {
          display_name: displayName.trim(),
          tone,
          welcome_message: welcomeMessage.trim(),
        },
      });
      refetchBusinessCtx();
      setAsstSaved(true);
      if (asstTimer.current) clearTimeout(asstTimer.current);
      asstTimer.current = setTimeout(() => setAsstSaved(false), 2500);
    } catch (e) {
      setAsstError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setAsstSaving(false);
    }
  }

  async function handleSaveHours() {
    const invalid = validateWeek(hours);
    if (invalid) {
      setHoursError(invalid);
      return;
    }
    setSavingHours(true);
    setHoursError(null);
    setHoursSaved(false);
    try {
      // Empty windows are valid: they mean "sin horario" → always open.
      const saved = await putBusinessHours(buildWindows(hours));
      setHours(windowsToWeek(saved));
      setHoursSaved(true);
      if (hoursTimer.current) clearTimeout(hoursTimer.current);
      hoursTimer.current = setTimeout(() => setHoursSaved(false), 2500);
    } catch (e) {
      setHoursError(e instanceof Error ? e.message : "No se pudo guardar el horario.");
    } finally {
      setSavingHours(false);
    }
  }

  // Gates only apply while the form hasn't hydrated yet; once hydrated, a
  // later ctx refetch (post-save) keeps rendering the form as-is.
  if (!hydrated) {
    if (ctxError) {
      return (
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Configuración
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configuración de tu negocio y asistente.
            </p>
          </div>
          <ErrorState description={ctxError} onRetry={refetchBusinessCtx} />
        </div>
      );
    }
    return <Loading rows={6} label="Cargando configuracion…" />;
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Configuración
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configura tu negocio y asistente. Cada sección se guarda por separado.
        </p>
      </div>

      <Tabs defaultValue="negocio">
        <TabsList>
          <TabsTrigger value="negocio">Negocio</TabsTrigger>
          <TabsTrigger value="asistente">Asistente</TabsTrigger>
          <TabsTrigger value="horario">Horario</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        </TabsList>

        {/* ── Negocio ─────────────────────────────────────────────── */}
        <TabsContent value="negocio" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Datos del negocio</CardTitle>
              <CardDescription>Información básica de tu negocio.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <Label htmlFor="biz-country">País</Label>
                <Select
                  items={countryItems.map((c) => ({ value: c.code, label: c.label }))}
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

              <div className="grid grid-cols-2 gap-4">
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
                saving={bizSaving}
                saved={bizSaved}
                error={bizError}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Asistente ───────────────────────────────────────────── */}
        <TabsContent value="asistente" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Asistente IA</CardTitle>
              <CardDescription>
                Configura cómo se comporta tu asistente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="asst-name">Nombre del asistente</Label>
                <Input
                  id="asst-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Maya"
                />
                <p className="text-[0.7rem] text-muted-foreground">
                  Tu asistente se presentará con este nombre en el chat (ej.: «Hola, soy
                  Maya»). El nombre del negocio se toma de la pestaña «Negocio». Esto no
                  cambia el nombre de contacto que se ve en WhatsApp (ese se configura
                  en Meta).
                </p>
                {!displayName.trim() && (
                  <p className="text-[0.7rem] text-muted-foreground">
                    Si lo dejas vacío, el asistente no se presenta con un nombre propio:
                    responde directamente en nombre del negocio.
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

              <div className="space-y-2">
                <Label htmlFor="asst-welcome">Mensaje de bienvenida</Label>
                <p className="text-[0.7rem] text-muted-foreground">
                  Es lo primero que tu asistente responde cuando un cliente te escribe
                  por primera vez. Si lo dejas vacío, usaremos uno por defecto.{" "}
                  <span className="italic">
                    Ejemplo: «¡Hola! Soy el asistente de tu negocio. ¿En qué puedo
                    ayudarte hoy?»
                  </span>
                </p>
                <Textarea
                  id="asst-welcome"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  placeholder="¡Hola! Gracias por escribir. ¿En qué puedo ayudarte hoy?"
                  rows={3}
                />
              </div>

              <SaveBar
                label="Guardar asistente"
                onSave={handleSaveAsistente}
                saving={asstSaving}
                saved={asstSaved}
                error={asstError}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Horario ─────────────────────────────────────────────── */}
        <TabsContent value="horario" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Horario de atención</CardTitle>
              <CardDescription>
                Define cuándo está abierto tu negocio. Fuera de este horario, el
                asistente responde con tu mensaje de «fuera de horario» y no se ofrecen
                citas. Si lo dejas todo cerrado, se atiende siempre.
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
                    saving={savingHours}
                    saved={hoursSaved}
                    error={hoursError}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <div className="mt-6">
            <ScheduleBlocks />
          </div>
        </TabsContent>

        {/* ── WhatsApp ────────────────────────────────────────────── */}
        <TabsContent value="whatsapp" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp</CardTitle>
              <CardDescription>
                Estado de la conexión con WhatsApp Business.
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
                      automáticos fuera de la ventana de 24 horas). Las tres plantillas
                      estándar se crean automáticamente al conectar tu cuenta de
                      WhatsApp.
                    </p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      <li>
                        <span className="font-medium">Recordatorio de cita</span>: aviso
                        previo con el servicio, lugar, fecha y hora.
                      </li>
                      <li>
                        <span className="font-medium">Confirmación de cita</span>: pide
                        confirmar o cancelar con botones de respuesta rápida.
                      </li>
                      <li>
                        <span className="font-medium">Seguimiento de conversación</span>
                        : retoma un chat que quedó sin respuesta.
                      </li>
                    </ul>
                  </div>

                  {templatesLoading && templates.length === 0 && (
                    <p className="pt-2 text-xs text-muted-foreground">
                      Cargando plantillas…
                    </p>
                  )}
                  {templates.length > 0 && (
                    <div className="space-y-1.5 pt-2">
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
                        <p className="text-[0.7rem] text-muted-foreground">
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
      </Tabs>
    </div>
  );
}
