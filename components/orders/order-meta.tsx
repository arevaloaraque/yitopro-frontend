import { Bot, Check, Clock, User, XCircle } from "lucide-react";

import type { OrderStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

/**
 * Shared presentation of an order's state and origin, so the list and the detail
 * drawer can never drift apart.
 *
 * Both badges carry an ICON AND TEXT, never colour alone: an operator who can't tell
 * the warning amber from the success green still reads "Borrador" and the clock. The
 * origin badge exists because the module's own subtitle promises "pedidos creados por
 * el asistente o el panel" and, until now, the panel gave no way to tell which was which.
 */

const STATUS_META: Record<
  OrderStatus,
  { label: string; variant: "warning" | "success" | "secondary"; Icon: typeof Clock }
> = {
  draft: { label: "Borrador", variant: "warning", Icon: Clock },
  confirmed: { label: "Confirmado", variant: "success", Icon: Check },
  // Grey on purpose: cancelled is a terminal, inert state, not a destructive action.
  // `destructive` here would read as an alarm about something already resolved.
  cancelled: { label: "Cancelado", variant: "secondary", Icon: XCircle },
};

/** Labels alone, for the status filter's options. */
export const statusLabels = Object.fromEntries(
  Object.entries(STATUS_META).map(([status, { label }]) => [status, label]),
) as Record<OrderStatus, string>;

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { label, variant, Icon } = STATUS_META[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

export function OrderOriginBadge({ createdByAi }: { createdByAi: boolean }) {
  return createdByAi ? (
    <Badge variant="info">
      <Bot aria-hidden />
      Asistente
    </Badge>
  ) : (
    <Badge variant="outline">
      <User aria-hidden />
      Panel
    </Badge>
  );
}
