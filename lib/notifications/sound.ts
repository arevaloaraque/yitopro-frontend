/**
 * Notification sounds for the operator console.
 *
 * Synthesised with the Web Audio API instead of shipping audio files: a binary asset
 * buys a licence, a 404 risk and cache headers, and nothing else. It also keeps the
 * whole thing testable — plain functions that tolerate a missing AudioContext.
 *
 * Why an operator console needs sound at all: WhatsApp conversations arrive while the
 * tab is in the background. A toast nobody sees is not a notification.
 *
 * The palette is modelled on Slack's, and the lesson taken from it is not "more beeps":
 * it is that each sound must be a distinct GESTURE, not the same shape at a different
 * pitch. Two sine notes 200 Hz apart are told apart by nobody who is not listening for
 * it; a knock, a rising ta-dá and a pitch glide are told apart while looking elsewhere,
 * which is the only situation where a notification sound matters. Hence the step
 * sequencer below (per-note duration, level, waveform and optional glide) rather than
 * the fixed "two equal notes" the first version could express.
 */

/** One articulated step: a note, optionally gliding to another pitch. */
type Step = {
  /** Starting frequency in Hz. */
  freq: number;
  /** Glide target — the ramp runs over the step's whole duration. */
  to?: number;
  /** Duration in ms. */
  ms: number;
  /** Level relative to the timbre's gain (default 1). */
  level?: number;
  /** Overrides the timbre's waveform for this step. */
  wave?: OscillatorType;
  /** Gap after the previous step ends, in ms (default 0). */
  gap?: number;
};

/** A timbre: a base waveform, a peak level, and the steps that shape the gesture. */
type Timbre = { wave: OscillatorType; gain: number; steps: readonly Step[] };

type Choice = { id: string; label: string } & Timbre;

/**
 * The timbres a person at the console can assign to an event.
 *
 * Deliberately far apart from each other — the point of picking one per event type is
 * telling them apart WITHOUT looking at the screen, which two similar pings defeat. The
 * ids are the persisted values, so renaming one silently resets whoever had it chosen
 * (`isSoundId` filters it out and the slot falls back to its default); the first five keep
 * the names the palette was drafted with, and the rest are the gestures the two-note model
 * could not express.
 */
export const SOUND_CHOICES = [
  {
    id: "ping",
    label: "Ping suave",
    wave: "sine",
    gain: 0.05,
    steps: [
      { freq: 660, ms: 90 },
      { freq: 880, ms: 90 },
    ],
  },
  {
    id: "campana",
    label: "Campanita",
    wave: "sine",
    gain: 0.042,
    steps: [
      { freq: 988, ms: 70 },
      { freq: 1319, ms: 150 },
    ],
  },
  {
    id: "toque",
    label: "Doble toque",
    wave: "triangle",
    gain: 0.06,
    steps: [
      { freq: 523, ms: 70 },
      { freq: 523, ms: 70, gap: 40 },
    ],
  },
  {
    id: "marimba",
    label: "Marimba",
    wave: "triangle",
    gain: 0.045,
    steps: [
      { freq: 740, ms: 80 },
      { freq: 988, ms: 130 },
    ],
  },
  {
    id: "burbuja",
    label: "Burbuja",
    wave: "sine",
    // A bubble is a glide, not two notes: the pitch slides up and the level fades.
    gain: 0.055,
    steps: [{ freq: 415, to: 700, ms: 170 }],
  },
  {
    id: "boop",
    label: "Boop",
    // One short soft blip — the least intrusive thing in the palette.
    wave: "sine",
    gain: 0.055,
    steps: [{ freq: 620, ms: 110 }],
  },
  {
    id: "plink",
    label: "Plink",
    // Bright and downward: reads as "something small landed".
    wave: "triangle",
    gain: 0.045,
    steps: [{ freq: 1480, to: 988, ms: 130 }],
  },
  {
    id: "tada",
    label: "Ta-dá",
    // A rising major triad: the only one in the palette that sounds like good news.
    wave: "triangle",
    gain: 0.04,
    steps: [
      { freq: 523, ms: 70 },
      { freq: 659, ms: 70 },
      { freq: 784, ms: 150, level: 1.1 },
    ],
  },
  {
    id: "whoa",
    label: "Whoa",
    // Up then back down — a question mark, for "look at this".
    wave: "sine",
    gain: 0.05,
    steps: [
      { freq: 440, to: 880, ms: 120 },
      { freq: 880, to: 560, ms: 140 },
    ],
  },
] as const satisfies readonly Choice[];

export type SoundId = (typeof SOUND_CHOICES)[number]["id"];

/** The slots whose voice the person at the console chooses. */
export type SoundSlot = "message" | "order" | "appointment";

/**
 * Every reason we make a noise. `alert` is NOT configurable and NOT in the palette
 * above: it means a person is waiting, and an operator who assigned it the same timbre
 * as their message ping would stop noticing escalations.
 */
export type SoundKind = SoundSlot | "alert";

/** Persisted across reloads so the operator doesn't re-configure every morning. Only
 * the access token is forbidden from web storage (repo security rules); a preference is fine
 * — the same place `next-themes` keeps the theme. */
const MUTE_KEY = "yitopro:notification-sound-muted";
const VOLUME_KEY = "yitopro:notification-sound-volume";

const SLOT_KEY: Record<SoundSlot, string> = {
  message: "yitopro:notification-sound:message",
  order: "yitopro:notification-sound:order",
  appointment: "yitopro:notification-sound:appointment",
};

/** Distinct by construction, which is the invariant this module keeps. */
const SLOT_DEFAULTS: Readonly<Record<SoundSlot, SoundId>> = Object.freeze({
  message: "ping",
  order: "marimba",
  appointment: "tada",
});

const SLOTS: SoundSlot[] = ["message", "order", "appointment"];

/**
 * The fixed voice for `alert`: a low double knock, the one gesture in the module that
 * is not a ping. Insistent and unmistakable — someone is waiting for a human.
 */
const ALERT_VOICE: Timbre = {
  wave: "triangle",
  gain: 0.075,
  steps: [
    { freq: 300, to: 190, ms: 90 },
    { freq: 300, to: 190, ms: 90, gap: 70 },
  ],
};

type AudioContextCtor = typeof AudioContext;

let audioContext: AudioContext | null = null;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  if (typeof AudioContext !== "undefined") return AudioContext;
  // Safari < 14.1 only has the prefixed constructor.
  return (
    (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ??
    null
  );
}

/** Lazily built: constructing an AudioContext before a user gesture leaves it
 * `suspended` on every modern browser, so there is nothing to gain by doing it at
 * import time — and a console warning on every page load to lose. */
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

/** Subscribers of the sound preferences (mute, volume and the per-slot timbres), so
 * React can read them with `useSyncExternalStore` instead of mirroring them in
 * component state (which would either desync or need a setState inside an effect). */
const listeners = new Set<() => void>();

export function subscribeSoundSettings(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function notify(): void {
  for (const listener of listeners) listener();
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode)
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* preference just won't persist */
  }
}

export function isSoundMuted(): boolean {
  return readStorage(MUTE_KEY) === "1";
}

export function setSoundMuted(muted: boolean): void {
  writeStorage(MUTE_KEY, muted ? "1" : "0");
  notify();
}

/**
 * 0..1, default 1 (what the palette's own gains were tuned at).
 *
 * A mute is not a volume: an operator in a shared room wants the pings quieter, not
 * gone, and told to choose between "loud" and "blind" they choose blind.
 */
export function getSoundVolume(): number {
  const raw = Number.parseFloat(readStorage(VOLUME_KEY) ?? "");
  if (!Number.isFinite(raw)) return 1;
  return Math.min(1, Math.max(0, raw));
}

export function setSoundVolume(volume: number): void {
  if (!Number.isFinite(volume)) return;
  writeStorage(VOLUME_KEY, String(Math.min(1, Math.max(0, volume))));
  notify();
}

function isSoundId(value: unknown): value is SoundId {
  return SOUND_CHOICES.some((choice) => choice.id === value);
}

/** Cached because `useSyncExternalStore` compares snapshots by identity: rebuilding the
 * object on every render would loop for ever. Dropped on any write. */
let cachedAssignments: Record<SoundSlot, SoundId> | null = null;

function readAssignments(): Record<SoundSlot, SoundId> {
  if (typeof window === "undefined") return { ...SLOT_DEFAULTS };
  const stored: Partial<Record<SoundSlot, SoundId>> = {};
  for (const slot of SLOTS) {
    const value = readStorage(SLOT_KEY[slot]);
    if (isSoundId(value)) stored[slot] = value;
  }
  const result = { ...SLOT_DEFAULTS, ...stored };
  // The invariant, applied on the way OUT too: storage can be stale or hand-edited, and
  // two slots sharing a timbre defeats the point of choosing. Repaired in slot order,
  // falling back to any timbre nothing else is using.
  const used = new Set<SoundId>();
  for (const slot of SLOTS) {
    if (used.has(result[slot])) {
      const free = SOUND_CHOICES.find((choice) => !used.has(choice.id));
      if (free) result[slot] = free.id;
    }
    used.add(result[slot]);
  }
  return result;
}

/** Which timbre each configurable slot plays, guaranteed distinct. */
export function getSoundAssignments(): Record<SoundSlot, SoundId> {
  if (!cachedAssignments) cachedAssignments = readAssignments();
  return cachedAssignments;
}

// A second tab is a second cache. Without this, tab B keeps its pre-change snapshot and
// its next write persists BOTH keys from it, reverting tab A's choice — a lost update,
// not a broken invariant, but the operator sees their pick undone. `storage` only fires
// in the OTHER tabs, so this cannot loop.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key.startsWith("yitopro:notification-sound")) {
      cachedAssignments = null;
      notify();
    }
  });
}

/** Stable object for SSR / the first client render (see useSyncExternalStore). */
export function getDefaultSoundAssignments(): Readonly<Record<SoundSlot, SoundId>> {
  return SLOT_DEFAULTS;
}

/**
 * Assigns a timbre to a slot. If another slot already uses it the two are SWAPPED, so
 * "no two slots share a sound" cannot be broken by any caller — the picker also hides
 * the taken options, but an invariant only the UI enforces is not an invariant.
 */
export function setSlotSound(slot: SoundSlot, id: SoundId): void {
  if (typeof window === "undefined" || !isSoundId(id)) return;
  const current = getSoundAssignments();
  if (current[slot] === id) return;
  const holder = SLOTS.find((other) => other !== slot && current[other] === id);
  const next = { ...current, [slot]: id };
  if (holder) next[holder] = current[slot];
  for (const key of SLOTS) writeStorage(SLOT_KEY[key], next[key]);
  cachedAssignments = next;
  notify();
}

/**
 * `resume()` rejects on a closed context and, on Safari/iOS, with `NotAllowedError`
 * when called outside a user gesture — which is precisely the branch that calls it. An
 * unhandled rejection here costs far more than a missing beep: the ping is played from
 * inside the SSE listener, and `lib/sse`'s `dispatchFrame` iterates its listeners with
 * no try/catch inside `runStream`'s network-error catch — so one Web Audio exception
 * skips the remaining listeners for that frame (dashboard, conversations) and tears the
 * stream down into a backoff reconnect, indistinguishable from the network dropping.
 * Silence is the correct degradation; a dead panel is not.
 */
function resumeQuietly(ctx: AudioContext): void {
  try {
    // Old Safari's resume() is callback-based and returns undefined, so normalise
    // before attaching the handler.
    void Promise.resolve(ctx.resume()).catch(() => {});
  } catch {
    /* nothing to do */
  }
}

/**
 * Called once from a real user gesture (a click anywhere in the shell). The browser's
 * autoplay policy keeps a context created outside a gesture `suspended`, and a
 * suspended context drops every `start()` silently — so without this the FIRST
 * notification of the session would be mute, which is exactly the one that matters.
 */
export function unlockSound(): void {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") resumeQuietly(ctx);
}

function timbreFor(kind: SoundKind): Timbre {
  if (kind === "alert") return ALERT_VOICE;
  const id = getSoundAssignments()[kind];
  return SOUND_CHOICES.find((choice) => choice.id === id) ?? SOUND_CHOICES[0];
}

/** Never throws: audio is a nicety, not a guarantee. */
function play(timbre: Timbre, volume = getSoundVolume()): void {
  if (volume <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // No gesture yet (or the tab was restored): try to wake it and skip this one rather
    // than queueing a beep that would land seconds late.
    resumeQuietly(ctx);
    return;
  }
  // Wrapped for the same reason as resumeQuietly: a browser that throws from
  // createOscillator (context closed mid-play, node limit reached) must cost a beep,
  // not the realtime stream.
  try {
    let at = ctx.currentTime;
    for (const step of timbre.steps) {
      const seconds = step.ms / 1000;
      at += (step.gap ?? 0) / 1000;
      const peak = timbre.gain * (step.level ?? 1) * volume;
      const osc = ctx.createOscillator();
      const envelope = ctx.createGain();
      osc.type = step.wave ?? timbre.wave;
      osc.frequency.setValueAtTime(step.freq, at);
      if (step.to !== undefined) {
        // Exponential, not linear: pitch is perceived logarithmically, so a linear ramp
        // sounds like it slows down at the top.
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, step.to), at + seconds);
      }
      // Attack/decay ramp: a raw gate on a sine clicks audibly.
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.012, seconds / 3));
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      osc.connect(envelope).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + seconds + 0.02);
      at += seconds;
    }
  } catch {
    /* silent */
  }
}

/** Plays the ping for an event, honouring the mute, the volume and the assignment. */
export function playNotificationSound(kind: SoundKind): void {
  if (isSoundMuted()) return;
  play(timbreFor(kind));
}

/**
 * Plays one timbre on demand, for the pickers in Ajustes. Ignores the mute on purpose:
 * the operator just clicked a sound to hear it, and answering that click with silence
 * would read as a broken control. The volume IS honoured — that is the thing being
 * auditioned when they drag the slider.
 */
export function previewSound(id: SoundId, volume?: number): void {
  const choice = SOUND_CHOICES.find((entry) => entry.id === id);
  if (choice) play(choice, volume ?? getSoundVolume());
}

/** Plays the fixed escalation voice, so Ajustes can show what it sounds like. */
export function previewAlertSound(): void {
  play(ALERT_VOICE);
}
