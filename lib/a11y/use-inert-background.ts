"use client";

import * as React from "react";

/**
 * Keeps the keyboard focus inside an open dialog/sheet by making everything
 * ELSE `inert` while it is open.
 *
 * Why this exists (QA 2026-07-30): Base UI 1.5.0 contains focus with two
 * sentinel `<span>`s whose re-trap is deferred to `requestAnimationFrame`, and
 * it leaves the rest of the document merely `aria-hidden` — never `inert`
 * (`FloatingFocusManager.js:322-325`); modals get no outer guards at all
 * (`FloatingPortal.js:128`). A Tab that lands in the same frame as the guard
 * walks straight to the document's first tabbable (the sidebar brand link) and
 * there is no way back. Racing the rAF is unwinnable; removing the background
 * from sequential navigation entirely is not. `inert` is the platform feature
 * for exactly this.
 *
 * Applied to the body's own children (minus the popup portals), NOT to `<body>`:
 * Base UI portals are children of `<body>`, so an inert body would make the
 * dialog inert to itself.
 *
 * A counter, not a boolean: dialogs nest (the confirm dialog inside the customer
 * Sheet), and the inner one closing must not un-inert the background while the
 * outer one is still open.
 */

let openLayers = 0;
/** Exactly the elements WE marked, so releasing never clears a pre-existing `inert`. */
let marked: HTMLElement[] = [];

function isPopupHost(el: Element): boolean {
  return (
    el.hasAttribute("data-base-ui-portal") ||
    // Next.js dev error overlay: inerting it would make a build error
    // unclickable while a dialog happens to be open.
    el.tagName.startsWith("NEXTJS-")
  );
}

function apply() {
  release();
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLElement) || isPopupHost(el) || el.hasAttribute("inert")) continue;
    // The ATTRIBUTE, not the `inert` IDL property: it is what CSS and the Playwright
    // focus probe read, and jsdom implements the attribute but not the property — via
    // the property this whole mechanism would be untestable (and silently absent in the
    // test environment while looking correct in the source).
    el.setAttribute("inert", "");
    marked.push(el);
  }
}

function release() {
  for (const el of marked) el.removeAttribute("inert");
  marked = [];
}

/**
 * @param active whether this layer is OPEN — not whether it is mounted. Base UI keeps a
 * closing popup mounted for its exit animation, and it restores focus to the trigger
 * during that window; an inert trigger cannot receive focus, so a mount-driven release
 * would drop the keyboard user on `<body>` every time they close a dialog.
 */
export function useInertBackground(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    openLayers += 1;
    // Re-applied on every layer: a nested popup's portal is created AFTER the
    // outer one was inerted, so the set has to be recomputed (and the new
    // portal skipped) instead of assuming the first pass covered it.
    apply();
    return () => {
      openLayers -= 1;
      if (openLayers <= 0) {
        openLayers = 0;
        release();
      } else {
        apply();
      }
    };
  }, [active]);
}
