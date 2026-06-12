import { Bot } from "lucide-react";
import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Agentes" };

export default function AgentsPage() {
  return (
    <PlaceholderPage
      title="Agentes"
      description="Tus agentes de IA y su configuración."
      icon={Bot}
    />
  );
}
