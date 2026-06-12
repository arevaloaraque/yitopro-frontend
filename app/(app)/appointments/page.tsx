import { Calendar } from "lucide-react";
import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Agenda" };

export default function AppointmentsPage() {
  return (
    <PlaceholderPage
      title="Agenda"
      description="Tus citas y reservas."
      icon={Calendar}
    />
  );
}
