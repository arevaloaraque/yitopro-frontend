import Link from "next/link";

import { BrandLogo, BrandMark } from "@/components/brand/logo";

/** Marca de la barra lateral: isotipo cuando colapsada, logo horizontal cuando expandida. */
export function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/dashboard"
      aria-label="Yitopro · ir al dashboard"
      className="flex items-center"
    >
      {collapsed ? (
        <BrandMark className="size-7" decorative />
      ) : (
        <BrandLogo className="text-[21px]" />
      )}
    </Link>
  );
}
