import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useInertBackground } from "@/lib/a11y/use-inert-background";

/**
 * Guards the focus-containment fix (QA 2026-07-30): while a dialog or sheet is open,
 * everything else must be `inert` so a Tab cannot walk out of it. Base UI leaves the
 * background merely `aria-hidden` and re-traps a frame late, which is a race no amount
 * of guard-tuning wins.
 *
 * jsdom does NOT implement sequential focus navigation, so "Tab stays inside" itself is
 * only testable in a real browser (the Playwright a11y module owns that). What IS
 * testable here — and is where the bugs actually live — is the bookkeeping: which
 * elements get marked, that the popup does not inert itself, that nesting does not
 * un-inert early, and that releasing never clears an `inert` we did not set.
 */

const shell = () => document.querySelector<HTMLElement>("[data-testid='shell']")!;
const portals = () => Array.from(document.querySelectorAll<HTMLElement>("[data-base-ui-portal]"));

function Shell() {
  return (
    <div data-testid="shell">
      <button type="button">fondo</button>
    </div>
  );
}

describe("useInertBackground", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("leaves the background alone while everything is closed", () => {
    render(
      <>
        <Shell />
        <Dialog open={false}>
          <DialogContent>contenido</DialogContent>
        </Dialog>
      </>,
    );
    expect(shell().closest("[inert]")).toBeNull();
  });

  it("inerts the background while a dialog is open and restores it on close", () => {
    const { rerender } = render(
      <>
        <Shell />
        <Dialog open>
          <DialogContent>contenido</DialogContent>
        </Dialog>
      </>,
    );
    // RTL's own container holds the shell, so this is the real "everything else".
    expect(shell().closest("[inert]")).not.toBeNull();

    rerender(
      <>
        <Shell />
        <Dialog open={false}>
          <DialogContent>contenido</DialogContent>
        </Dialog>
      </>,
    );
    expect(shell().closest("[inert]")).toBeNull();
  });

  it("releases on CLOSE, not on unmount", () => {
    // The distinction is the whole reason the hook takes the open state instead of
    // living in `DialogContent`: a real browser keeps a closing popup mounted for its
    // exit animation AND returns focus to the trigger during that window. An inert
    // trigger cannot take focus, so releasing on unmount dropped the keyboard user on
    // <body> on every close. (jsdom unmounts immediately — no `getAnimations` — so the
    // hook is exercised directly here; the browser half is the Playwright a11y module.)
    function Probe({ active }: { active: boolean }) {
      useInertBackground(active);
      return null;
    }
    const { rerender } = render(
      <>
        <Shell />
        <Probe active />
      </>,
    );
    expect(shell().closest("[inert]")).not.toBeNull();

    rerender(
      <>
        <Shell />
        <Probe active={false} />
      </>,
    );
    expect(shell().closest("[inert]")).toBeNull();
  });

  it("never inerts the popup's own portal", () => {
    render(
      <Dialog open>
        <DialogContent>contenido</DialogContent>
      </Dialog>,
    );
    // The portal is a child of <body>, which is exactly why <body> itself must not be
    // the inert target: it would make the dialog inert to itself.
    expect(portals()).not.toHaveLength(0);
    for (const portal of portals()) expect(portal.hasAttribute("inert")).toBe(false);
    expect(document.querySelector("[data-slot='dialog-content']")!.closest("[inert]")).toBeNull();
  });

  it("keeps the background inert when a NESTED dialog closes", () => {
    // The live shape: the confirm dialog inside the customer Sheet
    // (components/customers/customer-drawer.tsx). A counter, not a boolean, is what
    // makes the inner close not free the background while the sheet is still open.
    const tree = (innerOpen: boolean) => (
      <>
        <Shell />
        <Sheet open>
          <SheetContent>
            <Dialog open={innerOpen}>
              <DialogContent>confirmar</DialogContent>
            </Dialog>
          </SheetContent>
        </Sheet>
      </>
    );
    const { rerender } = render(tree(true));
    expect(shell().closest("[inert]")).not.toBeNull();
    for (const portal of portals()) expect(portal.hasAttribute("inert")).toBe(false);

    rerender(tree(false));
    expect(shell().closest("[inert]")).not.toBeNull();
    for (const portal of portals()) expect(portal.hasAttribute("inert")).toBe(false);
  });

  it("frees the background only once the last layer closes", () => {
    const tree = (sheetOpen: boolean, dialogOpen: boolean) => (
      <>
        <Shell />
        <Sheet open={sheetOpen}>
          <SheetContent>
            <Dialog open={dialogOpen}>
              <DialogContent>confirmar</DialogContent>
            </Dialog>
          </SheetContent>
        </Sheet>
      </>
    );
    const { rerender } = render(tree(true, true));
    rerender(tree(true, false));
    expect(shell().closest("[inert]")).not.toBeNull();
    rerender(tree(false, false));
    expect(shell().closest("[inert]")).toBeNull();
  });

  it("does not clear an inert that was already there", () => {
    const preexisting = document.createElement("div");
    preexisting.setAttribute("inert", "");
    preexisting.dataset.testid = "ajeno";
    document.body.appendChild(preexisting);

    const { rerender } = render(
      <Dialog open>
        <DialogContent>contenido</DialogContent>
      </Dialog>,
    );
    rerender(
      <Dialog open={false}>
        <DialogContent>contenido</DialogContent>
      </Dialog>,
    );
    expect(preexisting.hasAttribute("inert")).toBe(true);
  });
});
