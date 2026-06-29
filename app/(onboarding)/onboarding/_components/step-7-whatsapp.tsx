"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { submitEmbeddedSignupCode } from "@/lib/api";
import { useOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * WhatsApp Embedded Signup (F4-C) — real Meta flow.
 *
 * 1. Loads Meta's JS SDK and calls `FB.init` with NEXT_PUBLIC_META_APP_ID.
 * 2. The button triggers `FB.login` with the Embedded Signup `config_id`
 *    (response_type "code").
 * 3. On return, the client gets a short `code` and sends it to the backend
 *    (`POST /api/whatsapp/embedded-signup/callback/`). The backend handles the
 *    exchange/subscribe/persistence. Meta tokens NEVER travel through the client.
 */

interface FBLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}
interface FBSdk {
  init(params: Record<string, unknown>): void;
  login(cb: (r: FBLoginResponse) => void, params: Record<string, unknown>): void;
}
declare global {
  interface Window {
    FB?: FBSdk;
    fbAsyncInit?: () => void;
  }
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID;
const CONFIGURED = Boolean(APP_ID && CONFIG_ID);
const GRAPH_VERSION = "v23.0";

type ConnectState = "idle" | "connecting" | "connected" | "error";

export function Step7WhatsApp() {
  const { data, setWhatsappConnected } = useOnboarding();
  const [state, setState] = useState<ConnectState>(
    data.whatsappConnected ? "connected" : "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // If the SDK was already loaded (step remount), start ready.
  const [sdkReady, setSdkReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.FB),
  );
  const displayPhoneRef = useRef<string | null>(null);

  // Load Meta's JS SDK only once (only if credentials are present).
  useEffect(() => {
    if (!CONFIGURED || window.FB) return; // no creds, or already loaded (initial state)
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: APP_ID,
        autoLogAppEvents: true,
        xfbml: false,
        version: GRAPH_VERSION,
      });
      setSdkReady(true);
    };
    const ID = "facebook-jssdk";
    if (document.getElementById(ID)) return;
    const js = document.createElement("script");
    js.id = ID;
    js.src = "https://connect.facebook.net/en_US/sdk.js";
    js.async = true;
    js.defer = true;
    js.crossOrigin = "anonymous";
    document.body.appendChild(js);
  }, []);

  // Capture the session data Meta posts during Embedded Signup
  // (the backend returns it anyway; this is just for immediate feedback).
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!/\.facebook\.com$/.test(new URL(event.origin).hostname)) return;
      try {
        const info = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (info?.type === "WA_EMBEDDED_SIGNUP" && info?.data?.phone_number_id) {
          displayPhoneRef.current = info.data.phone_number_id;
        }
      } catch {
        // payload unrelated to Embedded Signup — ignore
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const handleConnect = useCallback(() => {
    if (!CONFIGURED || !window.FB) {
      setState("error");
      setErrorMsg(
        "WhatsApp no está configurado: define NEXT_PUBLIC_META_APP_ID y NEXT_PUBLIC_META_CONFIG_ID.",
      );
      return;
    }
    setState("connecting");
    setErrorMsg(null);
    window.FB.login(
      (response) => {
        const code = response?.authResponse?.code;
        if (!code) {
          // The user closed the popup without completing.
          setState("idle");
          return;
        }
        submitEmbeddedSignupCode(code)
          .then((result) => {
            setWhatsappConnected(result.phone_number_id, result.waba_id, result.display_phone_number);
            setState("connected");
          })
          .catch((err: unknown) => {
            setState("error");
            setErrorMsg(
              err instanceof Error ? err.message : "No se pudo conectar WhatsApp.",
            );
          });
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: "3" },
      },
    );
  }, [setWhatsappConnected]);

  return (
    <div className="flex flex-col items-center justify-center gap-5 py-8 text-center">
      <div
        className={cn(
          "flex size-16 items-center justify-center rounded-2xl transition-all duration-300",
          state === "connected"
            ? "bg-success/10 text-success ring-1 ring-success/20"
            : state === "error"
              ? "bg-destructive/10 text-destructive ring-1 ring-destructive/20"
              : state === "connecting"
                ? "bg-accent/10 text-accent ring-1 ring-accent/20"
                : "bg-muted text-muted-foreground",
        )}
      >
        {state === "connected" ? (
          <Check className="size-7" />
        ) : state === "error" ? (
          <AlertTriangle className="size-7" />
        ) : state === "connecting" ? (
          <Loader2 className="size-7 animate-spin" />
        ) : (
          <Link2 className="size-7" />
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-[0.95rem] font-semibold text-foreground">
          {state === "connected"
            ? "¡WhatsApp conectado!"
            : state === "connecting"
              ? "Conectando con WhatsApp..."
              : "Conecta tu cuenta de WhatsApp Business"}
        </p>
        {state === "connected" ? (
          <p className="max-w-sm text-[0.8rem] leading-relaxed text-muted-foreground">
            {data.whatsappNumber ? (
              <>
                WhatsApp Business vinculado:{" "}
                <span className="font-medium text-foreground">{data.whatsappNumber}</span>.{" "}
                Tu asistente atiende 24/7 y deriva a tu equipo cuando hace falta.
                Recomendación: usa este número como tu canal de atención principal.
              </>
            ) : (
              "Tu WhatsApp Business está conectado y atendiendo 24/7."
            )}
          </p>
        ) : (
          <p className="max-w-sm text-[0.8rem] leading-relaxed text-muted-foreground">
            {state === "connecting"
              ? "Completa el flujo en la ventana de Meta..."
              : "Esto te permitirá recibir y enviar mensajes desde Yitopro a través de la API de WhatsApp Business."}
          </p>
        )}
        {state === "error" && errorMsg ? (
          <p role="alert" className="max-w-sm text-[0.8rem] text-destructive">
            {errorMsg}
          </p>
        ) : null}
      </div>

      {!CONFIGURED ? (
        <p className="max-w-sm rounded-lg bg-muted px-3 py-2 text-[0.75rem] text-muted-foreground">
          Configura <code>NEXT_PUBLIC_META_APP_ID</code> y{" "}
          <code>NEXT_PUBLIC_META_CONFIG_ID</code> para habilitar el Embedded Signup.
        </p>
      ) : state !== "connected" ? (
        <Button
          onClick={handleConnect}
          disabled={state === "connecting" || !sdkReady}
          size="lg"
          className="mt-2"
        >
          {state === "connecting" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Conectando...
            </>
          ) : (
            <>
              <Link2 className="size-4" />
              {sdkReady ? "Conectar WhatsApp" : "Cargando..."}
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}
