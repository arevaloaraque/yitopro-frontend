import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * A Tailwind `data-*` variant that matches NOTHING fails silently: no error, no test,
 * just a rule that never applies. That is how `/settings` scrolled horizontally on a
 * 375px viewport for as long as it did — the file used `data-horizontal:` and
 * `group-data-horizontal/tabs:` while Base UI stamps `data-orientation="horizontal"`,
 * so every orientation-conditional rule here was dead, including the root's `flex-col`
 * that keeps the tab strip ABOVE the panel instead of beside it (QA 2026-07-30; the
 * first fix attempt reproduced the same typo).
 *
 * So: assert the selectors against the DOM the primitive really produces, not against
 * what we assumed it produces.
 */

function renderTabs(
  orientation: "horizontal" | "vertical" = "horizontal",
  variant: "default" | "line" = "default",
) {
  return render(
    <Tabs defaultValue="a" orientation={orientation}>
      <TabsList variant={variant}>
        <TabsTrigger value="a">Uno</TabsTrigger>
        <TabsTrigger value="b">Dos</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panel</TabsContent>
    </Tabs>,
  );
}

/** The four states this component can actually be in. */
const STATES = [
  ["horizontal", "default"],
  ["horizontal", "line"],
  ["vertical", "default"],
  ["vertical", "line"],
] as const;

const root = () => document.querySelector<HTMLElement>("[data-slot='tabs']")!;

/**
 * Every `data-[key=value]` variant token that selects on the component's OWN state.
 *
 * `has-data-[…]` is excluded: it selects on descendants the consumer passes in (an icon
 * slot), so it legitimately matches nothing in a bare render.
 */
function bracketDataTokens(el: HTMLElement): string[] {
  return Array.from(el.className.matchAll(/(has-)?data-\[([a-z-]+)=([a-z-]+)\]/g))
    .filter(([, has]) => !has)
    .map(([, , key, value]) => `[data-${key}="${value}"]`);
}

describe("Tabs", () => {
  it.each(["horizontal", "vertical"] as const)(
    "stamps the orientation the variants select on (%s)",
    (orientation) => {
      renderTabs(orientation);
      expect(root().getAttribute("data-orientation")).toBe(orientation);
      // The `group-data-[orientation=…]/tabs` variants resolve against this element, so
      // it is also the one that must carry the group name.
      expect(root().className).toContain("group/tabs");
    },
  );

  it("uses no bare data-horizontal / data-vertical variant anywhere", () => {
    renderTabs();
    // The exact rot that shipped: a bare token compiles to `[data-horizontal]`, which
    // Base UI never emits. Cheap, and it fails the moment someone writes it again.
    for (const el of document.querySelectorAll<HTMLElement>("[data-slot^='tabs']")) {
      expect(el.className).not.toMatch(/data-(horizontal|vertical)[:\]]/);
    }
  });

  it("targets no data state that the component can never be in", () => {
    // The invariant is NOT "every rule applies in this render" — a horizontal render
    // legitimately carries the vertical rules. It is that no variant selects a state
    // that does not exist in ANY of the four states, which is exactly what a typo
    // (`data-horizontal`) or a renamed primitive attribute produces.
    const wanted = new Set<string>();
    const realized = new Set<string>();
    for (const [orientation, variant] of STATES) {
      const { unmount } = renderTabs(orientation, variant);
      for (const el of document.querySelectorAll<HTMLElement>("[data-slot^='tabs']")) {
        for (const token of bracketDataTokens(el)) wanted.add(token);
        for (const name of el.getAttributeNames()) {
          if (!name.startsWith("data-")) continue;
          realized.add(`[${name}="${el.getAttribute(name)}"]`);
        }
      }
      unmount();
    }
    expect(wanted.size).toBeGreaterThan(0);
    expect([...wanted].filter((token) => !realized.has(token))).toEqual([]);
  });

  it("keeps the active trigger's data-active, which the styling depends on", () => {
    renderTabs();
    const active = document.querySelector<HTMLElement>("[data-slot='tabs-trigger'][data-active]");
    expect(active?.textContent).toBe("Uno");
  });

  it("lets a horizontal list scroll itself instead of widening the page", () => {
    renderTabs();
    const list = document.querySelector<HTMLElement>("[data-slot='tabs-list']")!;
    // `w-fit` + no overflow rule is what pushed 405px of triggers into a 375px viewport.
    expect(list.className).toContain("group-data-[orientation=horizontal]/tabs:overflow-x-auto");
    expect(list.className).toContain("group-data-[orientation=horizontal]/tabs:max-w-full");
  });
});
