import { Ban, CheckCircle2, Clock, Send, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PaymentStatus } from "@/lib/api/payments";

/**
 * Status as colour AND icon AND word.
 *
 * Three redundant channels because this is the column an operator scans down a
 * page of forty rows looking for one thing, and roughly one man in twelve
 * cannot tell the green one from the red one.
 */
const STYLES: Record<
  PaymentStatus,
  { label: string; icon: typeof Clock; className: string }
> = {
  // A LINK state, not a payment one: it was generated and shared, and nobody
  // has opened it yet. Deliberately not "Pendiente" — a pending payment means
  // the customer got as far as the gateway, and these two need different
  // follow-ups from the operator.
  sent: {
    label: "Enviado",
    icon: Send,
    className: "border-info/30 bg-info/10 text-info",
  },
  paid: {
    label: "Pagado",
    icon: CheckCircle2,
    className: "border-success/30 bg-success/10 text-success",
  },
  pending: {
    label: "Pendiente",
    icon: Clock,
    className: "border-warning/40 bg-warning/10 text-warning-foreground",
  },
  // Distinct from `expired`, which is OUR clock running out. This one is the
  // gateway saying no, and it is the operator's cue to send a new link.
  rejected: {
    label: "Rechazado",
    icon: Ban,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  expired: {
    label: "Expirado",
    icon: XCircle,
    className: "border-border bg-muted text-muted-foreground",
  },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  // An unknown status from a newer backend reads as itself rather than crashing
  // the table — the panel and the API do not deploy at the same instant.
  const style = STYLES[status] ?? {
    label: status,
    icon: Clock,
    className: "border-border bg-muted text-muted-foreground",
  };
  const Icon = style.icon;
  return (
    <Badge variant="outline" className={style.className}>
      <Icon className="size-3" aria-hidden="true" />
      {style.label}
    </Badge>
  );
}
