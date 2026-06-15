import { Construction, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/states";

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

/**
 * Página placeholder para que la navegación del sidebar funcione completa.
 * El contenido real de cada pantalla llega en próximas sesiones (F2/F3).
 */
export function PlaceholderPage({ title, description, icon }: PlaceholderPageProps) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-10">
      <div>
        <h1 className="text-[1.65rem] font-bold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-[0.8rem] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <EmptyState
        icon={icon ?? Construction}
        title="En construcción"
        description="Esta sección estará disponible próximamente."
      />
    </div>
  );
}
