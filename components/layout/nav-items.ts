import {
  Bot,
  Calendar,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Authenticated panel navigation, in order. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Conversaciones", href: "/conversations", icon: MessageSquare },
  { label: "Agenda", href: "/appointments", icon: Calendar },
  { label: "Servicios", href: "/services", icon: Sparkles },
  { label: "Productos", href: "/products", icon: ShoppingBag },
  { label: "Pedidos", href: "/orders", icon: Receipt },
  { label: "Clientes", href: "/customers", icon: Users },
  { label: "Agentes", href: "/agents", icon: Bot },
  { label: "Configuración", href: "/settings", icon: Settings },
];
