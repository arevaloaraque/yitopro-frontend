import { fileURLToPath } from "node:url";
import path from "node:path";

import type { NextConfig } from "next";

// Pin the workspace root: hay un package-lock.json suelto en el home del
// usuario y Next infiere mal la raíz si no lo fijamos.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
