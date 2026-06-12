import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="Resumen de la actividad de tu negocio."
      icon={LayoutDashboard}
    />
  );
}
