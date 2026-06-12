import { ShoppingBag } from "lucide-react";
import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Productos" };

export default function ProductsPage() {
  return (
    <PlaceholderPage
      title="Productos"
      description="Catálogo de productos de tu negocio."
      icon={ShoppingBag}
    />
  );
}
