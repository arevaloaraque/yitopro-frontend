"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MessageSquare, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, Loading } from "@/components/states";
import { getBusiness, updateBusiness } from "@/lib/api/businesses";
import type { AssistantTone } from "@/lib/types";

type PageState = "loading" | "error" | "ready";

const COUNTRIES = [
  { code: "CL", label: "Chile", currency: "CLP", zone: "America/Santiago" },
  { code: "AR", label: "Argentina", currency: "ARS", zone: "America/Argentina/Buenos_Aires" },
  { code: "MX", label: "Mexico", currency: "MXN", zone: "America/Mexico_City" },
  { code: "CO", label: "Colombia", currency: "COP", zone: "America/Bogota" },
  { code: "PE", label: "Peru", currency: "PEN", zone: "America/Lima" },
  { code: "ES", label: "Espana", currency: "EUR", zone: "Europe/Madrid" },
  { code: "US", label: "Estados Unidos", currency: "USD", zone: "America/New_York" },
];

const LANGUAGES = [
  { code: "es", label: "Espanol" },
  { code: "en", label: "English" },
  { code: "pt", label: "Portugues" },
];

const TONES: { value: AssistantTone; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "neutral", label: "Neutral" },
  { value: "casual", label: "Casual" },
];

export default function SettingsPage() {
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);

  // Business form
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("");
  const [language, setLanguage] = useState("");
  const [timezone, setTimezone] = useState("");

  // Assistant form
  const [displayName, setDisplayName] = useState("");
  const [tone, setTone] = useState<AssistantTone>("casual");
  const [assistantLanguage, setAssistantLanguage] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [autonomous, setAutonomous] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState("loading");
      setError(null);
      try {
        const b = await getBusiness();
        if (!cancelled) {
          setName(b.name);
          setCountry(b.country);
          setCurrency(b.currency);
          setLanguage(b.language);
          setTimezone(b.timezone);
          setDisplayName(b.assistant_config.display_name);
          setTone(b.assistant_config.tone);
          setAssistantLanguage(b.assistant_config.language);
          setWelcomeMessage(b.assistant_config.welcome_message);
          setAutonomous(b.assistant_config.autonomous);
          setState("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar configuración");
          setState("error");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function refetch() {
    setState("loading");
    setError(null);
    getBusiness()
      .then((b) => {
        setName(b.name);
        setCountry(b.country);
        setCurrency(b.currency);
        setLanguage(b.language);
        setTimezone(b.timezone);
        setDisplayName(b.assistant_config.display_name);
        setTone(b.assistant_config.tone);
        setAssistantLanguage(b.assistant_config.language);
        setWelcomeMessage(b.assistant_config.welcome_message);
        setAutonomous(b.assistant_config.autonomous);
        setState("ready");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Error al cargar configuración");
        setState("error");
      });
  }

  async function handleSave() {
    if (!name.trim()) {
      setSaveError("El nombre del negocio es obligatorio.");
      return;
    }
    if (!country) {
      setSaveError("Selecciona un pais.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updateBusiness({
        name: name.trim(),
        country,
        currency,
        language,
        timezone,
        assistant_config: {
          display_name: displayName.trim(),
          tone,
          language: assistantLanguage,
          welcome_message: welcomeMessage.trim(),
          autonomous,
        },
      });
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Error al guardar",
      );
    } finally {
      setSaving(false);
    }
  }

  if (state === "loading") return <Loading rows={6} label="Cargando configuracion…" />;

  if (state === "error") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configuración</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configuración de tu negocio y asistente.</p>
        </div>
        <ErrorState description={error ?? "Error desconocido"} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configuracion de tu negocio y asistente.</p>
      </div>

      {/* Business info */}
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
            <Label htmlFor="biz-country">País</Label>
            <Select value={country} onValueChange={(v) => {
              const selected = v ?? country;
              setCountry(selected);
              const c = COUNTRIES.find((x) => x.code === selected);
              if (c) {
                setCurrency(c.currency);
                setTimezone(c.zone);
              }
            }}>
              <SelectTrigger id="biz-country" className="w-full">
                <SelectValue placeholder="Selecciona un país" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="biz-currency">Moneda</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v ?? currency)}>
                <SelectTrigger id="biz-currency" className="w-full">
                  <SelectValue placeholder="Moneda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="CLP">CLP — Peso chileno</SelectItem>
                    <SelectItem value="ARS">ARS — Peso argentino</SelectItem>
                    <SelectItem value="MXN">MXN — Peso mexicano</SelectItem>
                    <SelectItem value="COP">COP — Peso colombiano</SelectItem>
                    <SelectItem value="PEN">PEN — Sol peruano</SelectItem>
                    <SelectItem value="EUR">EUR — Euro</SelectItem>
                    <SelectItem value="USD">USD — Dolar</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="biz-language">Idioma del negocio</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v ?? language)}>
                <SelectTrigger id="biz-language" className="w-full">
                  <SelectValue placeholder="Idioma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="biz-timezone">Zona horaria</Label>
            <Input
              id="biz-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Santiago"
            />
          </div>
        </CardContent>
      </Card>

      {/* Assistant config */}
      <Card>
        <CardHeader>
          <CardTitle>Asistente IA</CardTitle>
          <CardDescription>Configura cómo se comporta tu asistente.</CardDescription>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="asst-tone">Tono</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as AssistantTone)}>
                <SelectTrigger id="asst-tone" className="w-full">
                  <SelectValue placeholder="Tono" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {TONES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="asst-lang">Idioma de respuestas</Label>
              <Select value={assistantLanguage} onValueChange={(v) => setAssistantLanguage(v ?? assistantLanguage)}>
                <SelectTrigger id="asst-lang" className="w-full">
                  <SelectValue placeholder="Idioma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="asst-welcome">Mensaje de bienvenida</Label>
            <Textarea
              id="asst-welcome"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Hola! Soy el asistente de..."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label className="cursor-pointer text-sm">Autónomo</Label>
              <p className="text-[0.7rem] text-muted-foreground">
                El asistente responde automáticamente sin supervisión.
              </p>
            </div>
            <Switch checked={autonomous} onChange={setAutonomous} />
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp status */}
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp</CardTitle>
          <CardDescription>Estado de la conexión con WhatsApp Business.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border border-border/40 px-4 py-3">
            <MessageSquare className="size-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">WhatsApp Business API</p>
              <p className="text-xs text-muted-foreground">
                La conexión se configura durante el onboarding.
              </p>
            </div>
            <Badge variant="secondary" className="text-xs">
              No conectado
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              <Save className="size-4" />
              Guardar cambios
            </>
          )}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" />
            Guardado
          </span>
        )}
        {saveError && (
          <p className="text-sm text-destructive">{saveError}</p>
        )}
      </div>
    </div>
  );
}
