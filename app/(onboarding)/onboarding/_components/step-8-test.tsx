"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const SAMPLE_RESPONSE =
  "¡Hola! Gracias por tu mensaje de prueba. Soy el asistente IA de tu negocio. Estoy listo para agendar citas, consultar precios, gestionar pedidos y mucho más. ¿En qué puedo ayudarte? 🚀";

export function Step8Test() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    setResponse(null);

    // Simula el delay del envío de mensaje + respuesta del bot (~2s).
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setResponse(SAMPLE_RESPONSE);
    setSending(false);
  };

  return (
    <div className="space-y-5">
      <p className="text-[0.8rem] text-muted-foreground">
        Envía un mensaje de prueba para verificar que tu asistente IA responde
        correctamente. Esto simula una conversación real de WhatsApp.
      </p>

      {/* Chat simulation */}
      <Card className="bg-muted/30">
        <CardContent className="space-y-3 py-4">
          {/* User message */}
          {message && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[0.8rem] text-primary-foreground">
                {message}
              </div>
            </div>
          )}

          {/* AI response */}
          {response && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-card px-4 py-2.5 text-[0.8rem] text-foreground ring-1 ring-border/30">
                {response}
              </div>
            </div>
          )}

          {/* Sending indicator */}
          {sending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-card px-4 py-2.5 ring-1 ring-border/30">
                <span className="flex gap-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Input area */}
      <div className="flex gap-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Escribe un mensaje de prueba..."
          className="min-h-10 flex-1 resize-none"
          rows={2}
          disabled={sending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          onClick={handleSend}
          disabled={!message.trim() || sending}
          size="icon"
          className="shrink-0 self-end"
        >
          <Send className="size-4" />
        </Button>
      </div>

      {response && (
        <p className="text-center text-[0.75rem] text-success">
          Prueba completada. El asistente IA funciona correctamente.
        </p>
      )}
    </div>
  );
}
