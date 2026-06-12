import { Users } from "lucide-react";
import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Clientes" };

export default function CustomersPage() {
  return (
    <PlaceholderPage
      title="Clientes"
      description="Tus clientes y sus contactos."
      icon={Users}
    />
  );
}
