"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // A burst of events (the AI closing several threads, a sweep delivering reminders)
      // used to pile toasts up the whole screen. Four is what fits without covering the
      // work. This is a BACKSTOP: `notify()` already dismisses the oldest past four, so
      // sonner's own cap — which keeps the extras mounted at opacity 0 — should never
      // engage for notifications. It still guards a burst of action toasts from elsewhere.
      visibleToasts={4}
      // Siempre desplegados, no apilados en profundidad. Sin esto sonner escala cada toast
      // hacia atrás (1 / 0.95 / 0.9 / 0.85) y sus bordes derechos se corren hacia adentro,
      // así que los enlaces «Ver» caían en x distintas (medido: 1363, 1357, 1351, 1344) en
      // vez de formar una columna. A escala 1 todos miden lo mismo y quedan uno debajo del
      // otro, que es como se leen varios avisos.
      expand
      // Every toast gets its own dismiss, so a stack can be cleared without waiting it out.
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // Close button in the TOP-RIGHT corner. Sonner puts it top-left by default,
          // which is where the icon and the title are.
          "--toast-close-button-start": "unset",
          "--toast-close-button-end": "0",
          "--toast-close-button-transform": "translate(35%, -35%)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
