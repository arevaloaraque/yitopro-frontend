import Image from "next/image";
import Link from "next/link";

/** Marca de la barra lateral: isotipo cuando colapsada, logo horizontal cuando expandida. */
export function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/dashboard"
      aria-label="Yitopro · ir al dashboard"
      className="flex items-center"
    >
      {collapsed ? (
        <Image src="/brand/isotipo.svg" alt="Yitopro" width={28} height={28} priority />
      ) : (
        <Image
          src="/brand/horizontal.svg"
          alt="Yitopro"
          width={132}
          height={32}
          priority
        />
      )}
    </Link>
  );
}
