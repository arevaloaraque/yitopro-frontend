"use client";

import * as React from "react";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, Loader2, SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { searchCustomers } from "@/lib/api/customers";

type Option = { value: string; label: string; phone: string };
export type CustomerSelection = { id: string; name: string; phone?: string } | null;
type Selection = CustomerSelection;

/**
 * `Nombre · +56 9 1234 5678`.
 *
 * The phone is the disambiguator, not decoration: two customers called "María
 * González" are ordinary in this product, and picking the wrong one sends the
 * charge — or the appointment — to a stranger. It rides in BOTH the list and
 * the selected value, because the confusion does not end when the popup closes.
 *
 * `name` stays clean in what `onChange` hands back, so callers that print the
 * customer's name keep printing a name.
 */
function optionLabel(name: string, phone: string): string {
  const clean = name.trim();
  if (!clean) return phone;
  return phone ? `${clean} · ${phone}` : clean;
}

function toOption(c: { id: string; name: string; phone: string }): Option {
  return { value: c.id, label: optionLabel(c.name, c.phone), phone: c.phone };
}

/**
 * Customer search with server-side search (accessible Base UI combobox).
 * Replaces the `Select` that loaded ALL customers — scales to thousands of
 * records because it only fetches the results for what is typed (debounce →
 * `GET /customers/?search=&limit=20`).
 *
 * Fully controlled: the parent owns the selection (`value`), so there is no
 * duplicated selection state or synchronization effects.
 */
export function CustomerCombobox({
  value,
  onChange,
  placeholder = "Buscar cliente…",
  className,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: {
  value: Selection;
  onChange: (customer: Selection) => void;
  placeholder?: string;
  className?: string;
  /** Se reenvía al input para que un `<Label htmlFor>` externo lo asocie. */
  id?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
}) {
  const [options, setOptions] = React.useState<Option[]>([]);
  const [loading, setLoading] = React.useState(true);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function fetchOptions(q: string) {
    try {
      const res = await searchCustomers({ search: q || undefined, limit: 20 });
      setOptions(res.items.map(toOption));
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }

  // First set of options (first 20) on mount.
  React.useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const res = await searchCustomers({ limit: 20 });
        if (!cancelled) setOptions(res.items.map(toOption));
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    const t = setTimeout(() => {
      void loadInitial();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
      clearTimeout(timer.current);
    };
  }, []);

  const onInput = (q: string) => {
    setLoading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void fetchOptions(q), 250);
  };

  // Stable across renders (otherwise Base UI would rewrite the input on every render).
  const selected = React.useMemo<Option | null>(
    () =>
      value
        ? {
            value: value.id,
            label: optionLabel(value.name, value.phone ?? ""),
            phone: value.phone ?? "",
          }
        : null,
    [value],
  );

  return (
    <Combobox.Root
      items={options}
      value={selected}
      onValueChange={(v: Option | null) =>
        // The label carries the phone for display; `name` goes back plain.
        onChange(
          v ? { id: v.value, name: v.label.split(" · ")[0], phone: v.phone } : null,
        )
      }
      onInputValueChange={onInput}
      filter={null}
    >
      <div className={cn("relative", className)}>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Combobox.Input
          id={id}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          placeholder={placeholder}
          className="h-9 w-full min-w-0 rounded-xl border-[1.5px] border-input bg-background py-1.5 pr-3 pl-8 text-sm transition-all duration-150 outline-none placeholder:text-muted-foreground hover:border-input/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/20"
        />
        {loading && (
          <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="max-h-72 w-(--anchor-width) min-w-48 overflow-y-auto rounded-xl border-[1.5px] border-clay-line bg-popover p-1 text-popover-foreground shadow-clay">
            <Combobox.Empty className="px-2 py-3 text-center text-sm text-muted-foreground">
              {loading ? "Buscando…" : "Sin resultados"}
            </Combobox.Empty>
            <Combobox.List>
              {(item: Option) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1.5 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-muted data-highlighted:text-foreground"
                >
                  <span className="flex-1 truncate">{item.label}</span>
                  <Combobox.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
