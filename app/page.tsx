import Image from "next/image";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <Image
        src="/brand/horizontal.svg"
        alt="Yitopro"
        width={220}
        height={64}
        priority
      />
      <p className="max-w-md text-sm text-muted-foreground">
        Panel de administración. Fundación de diseño lista (F1-A); las pantallas del
        producto llegan en las próximas sesiones.
      </p>
      <Link href="/_design" className={buttonVariants({ size: "lg" })}>
        Ver design system
      </Link>
    </main>
  );
}
