import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    // Los tests NUNCA tocan el backend real: MSW (node) intercepta toda la red.
    env: {
      NEXT_PUBLIC_API_URL: "http://localhost:8050",
      NEXT_PUBLIC_API_MOCKING: "disabled",
    },
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e", "dist"],
  },
});
