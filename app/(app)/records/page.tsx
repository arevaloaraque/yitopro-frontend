import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Fichas" };

export default function RecordsPage() {
  return (
    <PlaceholderPage
      title="Fichas"
      description="Fichas dinámicas de tus clientes."
      icon={ClipboardList}
    />
  );
}
