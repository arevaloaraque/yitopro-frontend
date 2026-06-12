import {
  Bot,
  Calendar,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Scissors,
  Settings,
  ShoppingBag,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Navegación del panel autenticado, en orden. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Conversaciones", href: "/conversations", icon: MessageSquare },
  { label: "Agenda", href: "/appointments", icon: Calendar },
  { label: "Servicios", href: "/services", icon: Scissors },
  { label: "Productos", href: "/products", icon: ShoppingBag },
  { label: "Clientes", href: "/customers", icon: Users },
  { label: "Fichas", href: "/records", icon: ClipboardList },
  { label: "Agentes", href: "/agents", icon: Bot },
  { label: "Settings", href: "/settings", icon: Settings },
];
