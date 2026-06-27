"use client";

import { useEffect } from "react";

/**
 * Boundary raíz: reemplaza al root layout cuando algo falla antes/durante su
 * render, así que NO puede depender de `globals.css` ni de componentes con
 * tokens. Por eso usa estilos inline con los hex de marca.
 * ponytail: excepción consciente — es el único punto sin CSS de tokens disponible.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? error.name);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#ffffff",
          color: "#071A3A",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Algo salió mal</h1>
          <p style={{ color: "#5a6b85", fontSize: 14, lineHeight: 1.5, marginTop: 8 }}>
            Ocurrió un error inesperado. Recarga la página o inténtalo más tarde.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 24,
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "#6D35F2",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
