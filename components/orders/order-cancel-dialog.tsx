"use client";

import { Loader2 } from "lucide-react";

import type { Order } from "@/lib/api";
import { useMoney } from "@/lib/business";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OrderCancelDialogProps {
  /** Non-null means open. */
  order: Order | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (order: Order) => void;
  pending: boolean;
}

/**
 * Confirmation before cancelling an order.
 *
 * A real dialog rather than `window.confirm` (which the panel uses for deleting a
 * service) because this action MOVES INVENTORY: cancelling a confirmed order writes a
 * positive stock movement per product. The operator has to be able to read which order,
 * for how much, and that the stock comes back — none of which fits in a native prompt.
 */
export function OrderCancelDialog({
  order,
  onOpenChange,
  onConfirm,
  pending,
}: OrderCancelDialogProps) {
  const money = useMoney();
  if (!order) return null;

  const restoresStock = order.status === "confirmed";
  const productCount = order.items.length;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Cancelar el pedido #{order.id}?</DialogTitle>
          <DialogDescription>
            {order.customer} · {money(order.total)}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {restoresStock
            ? `El pedido estaba confirmado: se repone el stock de ${
                productCount === 1 ? "1 producto" : `${productCount} productos`
              } y queda registrado en el inventario.`
            : "El borrador queda cancelado. No hay stock comprometido, así que el inventario no cambia."}
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>
            Volver
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => onConfirm(order)}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Sí, cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
