/**
 * Notification sound module — the preference store and the "never break the
 * caller" contract. jsdom has no AudioContext, which is exactly the environment
 * the guard exists for: a browser that blocks audio must not take the
 * notification down with it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isSoundMuted,
  playNotificationSound,
  setSoundMuted,
  subscribeSoundMuted,
  unlockSound,
} from "../sound";

beforeEach(() => {
  window.localStorage.clear();
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
    const unsubscribe = subscribeSoundMuted(onChange);
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
