"use client";

import { useState } from "react";
import { Check, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * WhatsApp Embedded Signup — MOCK.
 *
 * TODO (F4-C): Reemplazar esta implementación por:
 * 1. Cargar el JS SDK de Meta: <script src="https://...embedded-signup.js">
 * 2. Renderizar el botón oficial con `FBEmbeddedSignup.init({...})`.
 * 3. Al recibir el callback con phone_number_id + waba_id, hacer POST al
 *    backend: `POST /api/business/whatsapp/callback` con los datos.
 * 4. El backend almacena phone_number_id, waba_id, access_token y activa
 *    el webhook de WhatsApp.
 *
 * Mientras tanto, este paso simula el flujo completo con un delay fake.
 */

type ConnectState = "idle" | "connecting" | "connected" | "error";

export function Step7WhatsApp() {
  const { data, setWhatsappConnected } = useOnboarding();
  const [state, setState] = useState<ConnectState>(
    data.whatsappConnected ? "connected" : "idle",
  );

  const handleConnect = async () => {
    setState("connecting");

    // Simula el delay del Embedded Signup real (~3s).
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // -- INICIO MOCK: datos falsos que F4-C reemplazará por el callback real --
    const fakePhoneNumberId = "5511999999999";
    const fakeWabaId = "123456789012345";
    // -- FIN MOCK --

    setState("connected");
    setWhatsappConnected(fakePhoneNumberId, fakeWabaId);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-5 py-8 text-center">
      <div
        className={cn(
          "flex size-16 items-center justify-center rounded-2xl transition-all duration-300",
          state === "connected"
            ? "bg-success/10 text-success ring-1 ring-success/20"
            : state === "connecting"
              ? "bg-accent/10 text-accent ring-1 ring-accent/20"
              : "bg-muted text-muted-foreground",
        )}
      >
        {state === "connected" ? (
          <Check className="size-7" />
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
        <p className="max-w-sm text-[0.8rem] leading-relaxed text-muted-foreground">
          {state === "connected"
            ? `Tu negocio está vinculado. ID: ${data.phoneNumberId}`
            : state === "connecting"
              ? "Esto toma unos segundos..."
              : "Esto te permitirá recibir y enviar mensajes directamente desde Yitopro a través de la API de WhatsApp Business."}
        </p>
      </div>

      {state !== "connected" && (
        <Button
          onClick={handleConnect}
          disabled={state === "connecting"}
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
              Conectar WhatsApp
            </>
          )}
        </Button>
      )}
    </div>
  );
}
