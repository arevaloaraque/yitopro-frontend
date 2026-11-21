"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * A single-line input whose length limit is VISIBLE.
 *
 * `maxLength` alone truncates a pasted value in complete silence: the operator pastes a
 * 300-character service name, sees a shorter one, and has no way to know the browser cut
 * it — which also made the server's own validation unreachable from the UI, so a QA pass
 * read "the backend accepts an over-long name" when the backend had never seen one
 * (2026-07-30). The counter appears only near the cap, so an ordinary "Ana Fuentes" is not
 * decorated with "11/120".
 *
 * The cap must match the column: Customer.name is 120, Product/Service.name are 255.
 * Without `maxLength` at all (as the services form was), a long paste reaches the API and
 * comes back as a 422 whose message is pydantic's English.
 */
export function CharCountInput({
  id,
  max,
  value,
  onChange,
  describedBy,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "maxLength" | "value" | "onChange"> & {
  id: string;
  max: number;
  value: string;
  onChange: (value: string) => void;
  /** Extra ids to announce with the field (e.g. a validation error). */
  describedBy?: string;
}) {
  const atCap = value.length >= max;
  // 80%: close enough that the limit is about to matter, far enough that the counter is
  // not permanent furniture.
  const show = value.length >= max * 0.8;
  const countId = `${id}-count`;
  return (
    <>
      <Input
        id={id}
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={[describedBy, show ? countId : null].filter(Boolean).join(" ") || undefined}
        className={className}
        {...props}
      />
      {show && (
        <p
          id={countId}
          // Announced, not merely visible: the truncation is invisible by nature.
          role={atCap ? "status" : undefined}
          className={cn(
            "text-[0.7rem] tabular-nums",
            atCap ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {atCap
            ? `Máximo ${max} caracteres. Si pegaste un texto más largo, se recortó.`
            : `${value.length}/${max}`}
        </p>
      )}
    </>
  );
}
