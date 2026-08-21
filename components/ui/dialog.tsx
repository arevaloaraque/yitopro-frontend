"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { useInertBackground } from "@/lib/a11y/use-inert-background";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: DialogPrimitive.Root.Props) {
  // Focus containment lives here, at the root, because this is where the OPEN state is —
  // `DialogContent` only knows whether it is mounted, and a closing dialog stays mounted
  // through its exit animation (see use-inert-background).
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen ?? false);
  useInertBackground(open ?? uncontrolled);
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(...args) => {
        setUncontrolled(args[0]);
        onOpenChange?.(...args);
      }}
      {...props}
    />
  );
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/35 duration-150 supports-backdrop-filter:backdrop-blur-sm dark:bg-black/70 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  // `grid-cols-[minmax(0,1fr)]`: sin esto la columna IMPLÍCITA del grid se dimensiona al
  // min-content de su contenido y puede exceder el `max-w` del propio diálogo — el mismo
  // vicio que `min-width: auto` en un flex item, pero en grid. Medido en el editor de pedidos
  // (2026-07-31): columna de 391.66px dentro de una caja de 343px en móvil, así que TODOS los
  // hijos (incluido el <h2> del título) se dibujaban 49px más anchos que el diálogo. Va en el
  // primitivo porque afecta a cualquier diálogo con contenido que no se pueda encoger, no
  // solo al que lo reportó.
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 grid-cols-[minmax(0,1fr)] gap-4 rounded-2xl border-[1.5px] border-clay-line bg-popover p-5 text-sm text-popover-foreground shadow-clay-lg duration-150 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-2xl border-t bg-muted/50 p-5 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Cerrar
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
};
