/**
 * Notification sound for the operator console.
 *
 * Synthesised with the Web Audio API instead of shipping an audio file: the ping
 * is two short sine notes, so a binary asset (plus its licence, its 404 risk and
 * its cache headers) buys nothing. It also keeps the whole thing testable — the
 * module exposes plain functions and tolerates a missing AudioContext.
 *
 * Why an operator console needs sound at all: WhatsApp conversations arrive while
 * the tab is in the background. A toast that nobody sees is not a notification.
 */

/** What kind of attention the event deserves. */
export type SoundKind = "message" | "alert" | "success";

/** Persisted across reloads so the operator doesn't re-mute every morning. Only
 * the access token is forbidden from web storage (see CLAUDE.md); a preference
 * is fine — same place `next-themes` keeps the theme. */
const MUTE_KEY = "yitopro:notification-sound-muted";

/** Two notes per kind (Hz) + how long the whole ping lasts (s). Quiet on purpose:
 * this fires while someone is working, it must not startle. */
const VOICES: Record<SoundKind, { notes: [number, number]; gain: number }> = {
  // Soft rising ping — a customer wrote.
  message: { notes: [660, 880], gain: 0.05 },
  // Insistent, lower and louder — someone is waiting for a human.
  alert: { notes: [520, 415], gain: 0.075 },
  // Bright confirmation — an appointment or an order landed.
  success: { notes: [740, 988], gain: 0.045 },
};

const NOTE_SECONDS = 0.09;

type AudioContextCtor = typeof AudioContext;

let audioContext: AudioContext | null = null;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  if (typeof AudioContext !== "undefined") return AudioContext;
  // Safari < 14.1 only has the prefixed constructor.
  return (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ?? null;
}

/** Lazily built: constructing an AudioContext before a user gesture leaves it
 * `suspended` on every modern browser, so there is nothing to gain by doing it
 * at import time — and plenty to lose (a console warning on every page load). */
function getContext(): AudioContext | null {
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return null; // no audio device / blocked — never break the caller
    }
  }
  return audioContext;
}

/** Subscribers of the mute preference, so React can read it with
 * `useSyncExternalStore` instead of mirroring it in component state (which would
 * either desync from the real value or need a setState inside an effect). */
const muteListeners = new Set<() => void>();

export function subscribeSoundMuted(onChange: () => void): () => void {
  muteListeners.add(onChange);
  return () => muteListeners.delete(onChange);
}

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false; // storage blocked (private mode) → audible by default
  }
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* preference just won't persist */
  }
  for (const listener of muteListeners) listener();
}

/**
 * Called once from a real user gesture (a click anywhere in the shell). The
 * browser's autoplay policy keeps a context created outside a gesture
 * `suspended`, and a suspended context drops every `start()` silently — so
 * without this the FIRST notification of the session would be mute, which is
 * exactly the one that matters.
 */
export function unlockSound(): void {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

/** Plays the ping. Never throws: audio is a nicety, not a guarantee. */
export function playNotificationSound(kind: SoundKind): void {
  if (isSoundMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // No gesture yet (or the tab was restored): try to wake it and skip this
    // one rather than queueing a beep that would land seconds late.
    void ctx.resume();
    return;
  }
  const { notes, gain } = VOICES[kind];
  const start = ctx.currentTime;
  notes.forEach((frequency, index) => {
    const at = start + index * NOTE_SECONDS;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    // Attack/decay ramp: a raw gate on a sine clicks audibly.
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_SECONDS);
    osc.connect(envelope).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + NOTE_SECONDS + 0.02);
  });
}
