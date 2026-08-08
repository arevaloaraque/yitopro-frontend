/**
 * Notification sound module — the preference store and the "never break the
 * caller" contract. jsdom has no AudioContext, which is exactly the environment
 * the guard exists for: a browser that blocks audio must not take the
 * notification down with it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSoundAssignments,
  getSoundVolume,
  isSoundMuted,
  playNotificationSound,
  previewSound,
  setSlotSound,
  setSoundMuted,
  setSoundVolume,
  SOUND_CHOICES,
  subscribeSoundSettings,
  unlockSound,
} from "../sound";

beforeEach(() => {
  window.localStorage.clear();
  // Clearing storage is not enough on its own: the module keeps the assignments in a
  // module-level cache (useSyncExternalStore compares by identity), and it only re-reads
  // storage when something invalidates that cache. `setSlotSound` returns EARLY when the
  // value already matches, so seeding through it wrote nothing whenever the previous test
  // happened to leave these exact values — and the case silently inherited the previous
  // test's state. It passed or failed depending on execution ORDER, which is the one thing
  // a test must never do (own debt, 2026-07-30).
  //
  // `storage` (key === null means "cleared") is the module's real invalidation path, the one
  // a second tab uses, so resetting through it needs no test-only escape hatch.
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  setSlotSound("message", "ping");
  setSlotSound("order", "marimba");
});

describe("sound assignments", () => {
  it("offers a palette of distinct ids, each with at least one step", () => {
    expect(SOUND_CHOICES.length).toBeGreaterThanOrEqual(9);
    expect(new Set(SOUND_CHOICES.map((c) => c.id)).size).toBe(SOUND_CHOICES.length);
    // A gesture needs a shape: an empty step list would be a silent "sound".
    expect(SOUND_CHOICES.every((c) => c.steps.length >= 1)).toBe(true);
  });

  it("defaults every slot to a different sound", () => {
    const assignments = getSoundAssignments();
    const ids = Object.values(assignments);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("swaps instead of letting two slots share one sound", () => {
    const { message: before } = getSoundAssignments();
    setSlotSound("order", before); // exactly what the picker refuses to offer
    const after = getSoundAssignments();
    expect(after.order).toBe(before);
    // Nothing else kept it: the three are still telling each other apart.
    expect(new Set(Object.values(after)).size).toBe(3);
  });

  it("keeps the third slot distinct when it is the one being taken from", () => {
    const { appointment: before } = getSoundAssignments();
    setSlotSound("message", before);
    const after = getSoundAssignments();
    expect(after.message).toBe(before);
    expect(new Set(Object.values(after)).size).toBe(3);
  });

  it("persists the choice and notifies subscribers", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeSoundSettings(onChange);
    setSlotSound("message", "campana");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getSoundAssignments().message).toBe("campana");
    expect(window.localStorage.getItem("yitopro:notification-sound:message")).toBe(
      "campana",
    );
    unsubscribe();
  });

  it("ignores an unknown id (stale storage, hand-edited)", () => {
    const before = getSoundAssignments();
    // @ts-expect-error deliberately outside SoundId
    setSlotSound("message", "trombon");
    expect(getSoundAssignments()).toEqual(before);
  });

  it("picks up a choice made in another tab", () => {
    // Two tabs are two caches: without the storage listener, tab B kept its pre-change
    // snapshot and its next write persisted BOTH keys from it, reverting tab A's pick.
    const onChange = vi.fn();
    const unsubscribe = subscribeSoundSettings(onChange);
    const before = getSoundAssignments();

    window.localStorage.setItem("yitopro:notification-sound:message", "campana");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "yitopro:notification-sound:message",
        newValue: "campana",
      }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getSoundAssignments()).not.toBe(before);
    expect(getSoundAssignments().message).toBe("campana");
    unsubscribe();
  });

  it("re-reads on a foreign clear() and ignores unrelated keys", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeSoundSettings(onChange);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "theme", newValue: "dark" }),
    );
    expect(onChange).not.toHaveBeenCalled();

    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("returns the same object until something changes (useSyncExternalStore contract)", () => {
    expect(getSoundAssignments()).toBe(getSoundAssignments());
    const before = getSoundAssignments();
    setSlotSound("message", "burbuja");
    expect(getSoundAssignments()).not.toBe(before);
  });
});

describe("sound preference", () => {
  it("is audible by default", () => {
    expect(isSoundMuted()).toBe(false);
  });

  it("persists mute across reads (survives a reload)", () => {
    setSoundMuted(true);
    expect(isSoundMuted()).toBe(true);
    setSoundMuted(false);
    expect(isSoundMuted()).toBe(false);
  });

  it("notifies subscribers so React can read it without mirroring state", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeSoundSettings(onChange);
    setSoundMuted(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    setSoundMuted(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("falls back to audible when storage is blocked (private mode)", () => {
    const spy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(isSoundMuted()).toBe(false);
    spy.mockRestore();
  });
});

describe("sound volume", () => {
  it("defaults to full and clamps whatever storage holds", () => {
    expect(getSoundVolume()).toBe(1);

    for (const [stored, expected] of [
      ["0.5", 0.5],
      ["2", 1],
      ["-1", 0],
      ["", 1],
      ["ruido", 1],
    ] as const) {
      window.localStorage.setItem("yitopro:notification-sound-volume", stored);
      expect(getSoundVolume()).toBe(expected);
    }
  });

  it("persists and notifies, and ignores a non-finite value", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeSoundSettings(onChange);

    setSoundVolume(0.4);
    expect(getSoundVolume()).toBe(0.4);
    expect(onChange).toHaveBeenCalledTimes(1);

    setSoundVolume(Number.NaN); // a bad caller must not wipe the preference
    expect(getSoundVolume()).toBe(0.4);
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});

describe("playback safety", () => {
  it("does not throw where AudioContext is unavailable", () => {
    expect(() => playNotificationSound("message")).not.toThrow();
    expect(() => playNotificationSound("alert")).not.toThrow();
    expect(() => unlockSound()).not.toThrow();
  });

  it("does not even try to build a context while muted", () => {
    setSoundMuted(true);
    const ctor = vi.fn();
    // jsdom has no AudioContext; plant a spy to prove the muted path returns
    // before touching it.
    const planted = window as unknown as { AudioContext?: unknown };
    planted.AudioContext = ctor;
    playNotificationSound("message");
    expect(ctor).not.toHaveBeenCalled();
    delete planted.AudioContext;
  });
});

/**
 * Everything above runs in jsdom, which has NO AudioContext — so `getContext()`
 * returns null and the synthesis path is never entered. The "never throws" rule was
 * therefore only tested where it could not fail (review 2026-07-27). These plant a
 * context and exercise the two ways a real browser breaks: `resume()` rejecting
 * (Safari/iOS outside a gesture — exactly the branch that calls it) and a node
 * factory throwing mid-play.
 *
 * The module caches its context in a module-level singleton, so each case gets a fresh
 * import.
 */
const node: Record<string, unknown> = {
  type: "",
  // `frequency` is an AudioParam, not a bag with a `value`: the palette now glides pitch
  // (burbuja/plink/whoa), so `setValueAtTime` records the note and the ramp records the
  // target. A plain `{value}` made the first step throw and the whole gesture abort.
  frequency: {
    value: 0,
    setValueAtTime: vi.fn(function (this: void, v: number) {
      (node.frequency as { value: number }).value = v;
    }),
    exponentialRampToValueAtTime: vi.fn(),
  },
  gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  start: vi.fn(),
  stop: vi.fn(),
};
node.connect = vi.fn(() => node);

/** One stub context for the whole block: the module caches the first context it builds
 * successfully, so planting a new constructor later would be ignored. The tests above
 * never cached one — with no AudioContext, `getContext()` returns null without
 * storing anything — so this block gets to be the first. Behaviour is varied by
 * mutating this object, not by re-importing. */
const stub = {
  state: "running" as AudioContextState,
  currentTime: 0,
  resume: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  createOscillator: vi.fn(() => node),
  createGain: vi.fn(() => node),
  destination: {},
};

/** A plain function, not `vi.fn()`: the module builds the context with `new`, and a mock
 * whose implementation is an arrow function is not constructible — `getContext()` would
 * swallow the TypeError and hand back null, silently skipping every case below. */
function StubAudioContext() {
  return stub;
}

describe("playback safety with a real context", () => {
  beforeAll(() => {
    (window as unknown as { AudioContext?: unknown }).AudioContext = StubAudioContext;
  });

  afterAll(() => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  beforeEach(() => {
    stub.state = "running";
    stub.resume.mockClear().mockImplementation(() => Promise.resolve());
    stub.createOscillator.mockClear().mockImplementation(() => node);
  });

  it("plays one oscillator per step (so the cases below reach the synthesis path)", () => {
    const ping = SOUND_CHOICES.find((c) => c.id === "ping")!;
    playNotificationSound("message");
    expect(stub.createOscillator).toHaveBeenCalledTimes(ping.steps.length);
  });

  it("swallows a rejected resume() instead of leaving an unhandled rejection", async () => {
    // An unhandled rejection here does not merely lose a beep: the ping is played from
    // inside the SSE listener, whose dispatch loop has no try/catch, so the throw would
    // skip the remaining listeners and tear the realtime stream into a reconnect.
    stub.state = "suspended";
    stub.resume.mockImplementation(() => Promise.reject(new Error("NotAllowedError")));

    expect(() => playNotificationSound("message")).not.toThrow();
    expect(() => unlockSound()).not.toThrow();
    expect(stub.resume).toHaveBeenCalledTimes(2);
    expect(stub.createOscillator).not.toHaveBeenCalled(); // skipped, not queued late
    // Let the rejection settle: vitest fails the run on an unhandled one.
    await Promise.resolve();
  });

  it("survives a resume() that throws synchronously (old callback-based Safari)", () => {
    stub.state = "suspended";
    stub.resume.mockImplementation(() => {
      throw new Error("InvalidStateError");
    });
    expect(() => playNotificationSound("message")).not.toThrow();
  });

  it("survives a node factory throwing mid-play", () => {
    stub.createOscillator.mockImplementation(() => {
      throw new Error("context closed");
    });
    expect(() => playNotificationSound("alert")).not.toThrow();
  });

  it("plays the timbre the slot is assigned, and messages differ from orders", () => {
    setSlotSound("message", "campana");
    setSlotSound("order", "burbuja");
    const campana = SOUND_CHOICES.find((c) => c.id === "campana")!;
    const burbuja = SOUND_CHOICES.find((c) => c.id === "burbuja")!;

    const played: number[] = [];
    stub.createOscillator.mockImplementation(() => {
      // The module sets frequency AFTER creating the node, so read it on stop().
      (node.stop as ReturnType<typeof vi.fn>).mockImplementation(() => {
        played.push((node.frequency as { value: number }).value);
      });
      return node;
    });

    playNotificationSound("message");
    expect(played).toEqual(campana.steps.map((step) => step.freq));

    played.length = 0;
    playNotificationSound("order");
    expect(played).toEqual(burbuja.steps.map((step) => step.freq));
  });

  it("previews a sound even while muted (the operator just clicked it)", () => {
    const marimba = SOUND_CHOICES.find((c) => c.id === "marimba")!;
    setSoundMuted(true);
    previewSound("marimba");
    expect(stub.createOscillator).toHaveBeenCalledTimes(marimba.steps.length);
    // …while a real notification stays silent.
    stub.createOscillator.mockClear();
    playNotificationSound("message");
    expect(stub.createOscillator).not.toHaveBeenCalled();
  });
});

