import { fileURLToPath } from "node:url";
import path from "node:path";

import type { NextConfig } from "next";

// Pin the workspace root: hay un package-lock.json suelto en el home del
// usuario y Next infiere mal la raíz si no lo fijamos.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// ponytail: sin `script-src`. Next inyecta scripts inline y el Embedded Signup
// carga el SDK de Meta, así que un CSP de scripts exige nonces por request
// (middleware). Esto cubre clickjacking, MIME sniffing y <base>/<object>.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  turbopack: {
    root: projectRoot,
  },
  // Orígenes permitidos para el dev server (cross-origin). Editable vía env:
  // ALLOWED_DEV_ORIGINS="foo.local,192.168.1.5" (separados por coma).
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};

export default nextConfig;
