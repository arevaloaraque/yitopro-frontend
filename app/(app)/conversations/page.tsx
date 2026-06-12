import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Conversaciones" };

export default function ConversationsPage() {
  return (
    <PlaceholderPage
      title="Conversaciones"
      description="Mensajes de WhatsApp con tus clientes."
      icon={MessageSquare}
    />
  );
}
