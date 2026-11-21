import {
  Bot,
  Calendar,
  ChartColumn,
  CreditCard,
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
  /** Hidden for staff sessions (the backend still enforces it with a 403). */
  ownerOnly?: true;
  /**
   * Hidden when the contracted plan has no assistant. Same shape and same
   * contract as `ownerOnly`: the router behind it answers 403 regardless, this
   * only spares the customer a dead end.
   */
  requiresAssistant?: true;
}

/** Authenticated panel navigation, in order. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Conversaciones",
    href: "/conversations",
    icon: MessageSquare,
    requiresAssistant: true,
  },
  { label: "Agenda", href: "/appointments", icon: Calendar },
  { label: "Servicios", href: "/services", icon: Sparkles },
  { label: "Productos", href: "/products", icon: ShoppingBag },
  { label: "Pedidos", href: "/orders", icon: Receipt },
  { label: "Pagos", href: "/payments", icon: CreditCard },
  { label: "Clientes", href: "/customers", icon: Users },
  { label: "Agentes", href: "/agents", icon: Bot, requiresAssistant: true },
  { label: "Reportes", href: "/reports", icon: ChartColumn, ownerOnly: true },
  { label: "Configuración", href: "/settings", icon: Settings },
];
