"use client";

import Image from "next/image";

import { RequireAuth } from "@/lib/auth";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <div className="flex min-h-svh flex-col bg-background">
        <header className="flex h-16 shrink-0 items-center border-b border-border/40 px-6">
          <Image
            src="/brand/horizontal.svg"
            alt="Yitopro"
            width={130}
            height={36}
            priority
          />
        </header>
        <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-6 py-10">
          {children}
        </main>
      </div>
    </RequireAuth>
  );
}
