import { Scissors } from "lucide-react";
import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Servicios" };

export default function ServicesPage() {
  return (
    <PlaceholderPage
      title="Servicios"
      description="Los servicios que ofrece tu negocio."
      icon={Scissors}
    />
  );
}
