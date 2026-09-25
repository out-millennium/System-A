/* ============================================================================
   Sound engine (client-only) for System A.

   • Ambient hum — a seamless loop played through a WebAudio gain node whose
     level randomly WANDERS between 30% and 100% of the base volume, giving the
     drone a living, chaotic feel (per the design). Base volume is deliberately
     low (background).
   • Hover tick — a short, quiet sound played on pointer enter/leave of buttons
     and links.

   The user preference is stored in localStorage. Sound is OFF by default:
   browsers block autoplay until a user gesture anyway, and unsolicited sound is
   poor UX — it starts only after the user turns it on. Everything is guarded so
   it never throws on unsupported browsers or when files are missing.
   ========================================================================= */

const STORAGE_KEY = "sa_sound";
const AMBIENT_URL = "/sounds/ambient.mp3";
const HOVER_URL = "/sounds/hover.mp3";
const NOTIFY_URL = "/sounds/06-action-triple-success.wav";
const ACTION_URLS = {
  error: "/sounds/04-error-soft.wav",
  confirm: "/sounds/05-action-double-confirm.wav",
  transfer: "/sounds/07-action-four-ready.wav",
  important: "/sounds/08-action-five-rising.wav",
  negative: "/sounds/09-action-low-complete.wav",
} as const;

export type ActionSound = keyof typeof ACTION_URLS;

// Base ambient level (peak of the chaotic wander). Kept low = background.
const AMBIENT_BASE = 0.5;
// Hover tick — halved from 0.5 to 0.25 so it sits well under the ambient bed.
const HOVER_VOLUME = 0.25;
// Notification jingle — a short cheerful "you have new notifications" chime.
const NOTIFY_VOLUME = 0.6;

// Separate preference for the notification jingle. It is GATED by the master
// sound toggle (master off = silence, always), but can be turned off on its own
// while other sounds stay on, and vice-versa. Defaults to ON.
const NOTIFY_KEY = "sa_notify_sound";
const NOTIFY_VOLUME_KEY = "sa_notify_volume"; // "0".."1" (default 0.6)
const NOTIFY_DND_KEY = "sa_notify_dnd"; // "HH:MM-HH:MM" quiet window, or ""

export function notifyVolume(): number {
  if (typeof window === "undefined") return 0.6;
  try {
    const v = parseFloat(localStorage.getItem(NOTIFY_VOLUME_KEY) || "");
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6;
  } catch {
    return 0.6;
  }
}
export function setNotifyVolume(v: number): void {
  try {
    localStorage.setItem(NOTIFY_VOLUME_KEY, String(Math.min(1, Math.max(0, v))));
  } catch {
    /* ignore */
  }
}

export function notifyDnd(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(NOTIFY_DND_KEY) || "";
  } catch {
    return "";
  }
}
export function setNotifyDnd(window_: string): void {
  try {
    localStorage.setItem(NOTIFY_DND_KEY, window_);
  } catch {
    /* ignore */
  }
}

/** Is the current local time inside the Do-Not-Disturb quiet window?
    Window is "HH:MM-HH:MM"; supports overnight spans (e.g. 22:00-07:00). */
export function inDndWindow(now: Date = new Date()): boolean {
  const w = notifyDnd();
  const m = w.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const [, h1, m1, h2, m2] = m;
  const start = +h1 * 60 + +m1;
  const end = +h2 * 60 + +m2;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start === end) return false;
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

/** Is the notification jingle enabled? Defaults to TRUE when never set. It only
    actually plays when the master sound toggle is ALSO on. SSR-safe. */
export function notifySoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(NOTIFY_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setNotifySoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFY_KEY, enabled ? "on" : "off");
  } catch {
    /* storage may be blocked */
  }
}

/** Sound enabled? Defaults to FALSE when never set. SSR-safe. */
export function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* storage may be blocked */
  }
}

type Engine = {
  ctx: AudioContext;
  ambientEl: HTMLAudioElement;
  ambientGain: GainNode;
  hoverBuffer: AudioBuffer | null;
  notifyBuffer: AudioBuffer | null;
  wander: number | null; // interval id for the chaotic gain wander
  ambientOn: boolean;
};

let engine: Engine | null = null;

/** Lazily create the audio graph (must be called from a user gesture). */
async function ensureEngine(): Promise<Engine | null> {
  if (typeof window === "undefined") return null;
  if (engine) return engine;
  try {
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();

    // Ambient via <audio loop> routed into WebAudio so we can modulate gain.
    const ambientEl = new Audio(AMBIENT_URL);
    ambientEl.loop = true;
    ambientEl.crossOrigin = "anonymous";
    const src = ctx.createMediaElementSource(ambientEl);
    const ambientGain = ctx.createGain();
    ambientGain.gain.value = AMBIENT_BASE;
    src.connect(ambientGain).connect(ctx.destination);

    // Preload the short hover sound into a buffer for low-latency playback.
    let hoverBuffer: AudioBuffer | null = null;
    try {
      const res = await fetch(HOVER_URL);
      const arr = await res.arrayBuffer();
      hoverBuffer = await ctx.decodeAudioData(arr);
    } catch {
      hoverBuffer = null;
    }

    // Preload the notification jingle too.
    // Preload the currently-selected melody; others are lazily decoded and
    // cached in _notifyCache the first time they're chosen.
    let notifyBuffer: AudioBuffer | null = null;
    try {
      const url = NOTIFY_URL;
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      notifyBuffer = await ctx.decodeAudioData(arr);
      _notifyCache.set(url, notifyBuffer);
    } catch {
      notifyBuffer = null;
    }

    engine = {
      ctx,
      ambientEl,
      ambientGain,
      hoverBuffer,
      notifyBuffer,
      wander: null,
      ambientOn: false,
    };
    return engine;
  } catch {
    return null;
  }
}

/** Start the chaotic gain wander: every ~400–1200ms, glide the ambient gain to
    a new random target in [30%, 100%] of the base level. */
function startWander(e: Engine) {
  if (e.wander != null) return;
  const schedule = () => {
    const factor = 0.3 + Math.random() * 0.7; // 30%..100%
    const target = AMBIENT_BASE * factor;
    const now = e.ctx.currentTime;
    try {
      e.ambientGain.gain.cancelScheduledValues(now);
      e.ambientGain.gain.setValueAtTime(e.ambientGain.gain.value, now);
      // smooth glide over 0.3–0.9s so the change feels organic, not steppy
      e.ambientGain.gain.linearRampToValueAtTime(target, now + 0.3 + Math.random() * 0.6);
    } catch {
      /* ignore */
    }
    e.wander = window.setTimeout(schedule, 400 + Math.random() * 800);
  };
  schedule();
}

function stopWander(e: Engine) {
  if (e.wander != null) {
    clearTimeout(e.wander);
    e.wander = null;
  }
}

/** Start ambient (call from a user gesture, e.g. enabling the toggle or the
    first click after it's on). No-op if disabled. */
export async function startAmbient(): Promise<void> {
  if (!soundEnabled()) return;
  const e = await ensureEngine();
  if (!e) return;
  try {
    if (e.ctx.state === "suspended") await e.ctx.resume();
    await e.ambientEl.play().catch(() => {});
    e.ambientOn = true;
    startWander(e);
  } catch {
    /* autoplay may still be blocked until a gesture; ignored */
  }
}

export function stopAmbient(): void {
  if (!engine) return;
  try {
    engine.ambientEl.pause();
  } catch {
    /* ignore */
  }
  stopWander(engine);
  engine.ambientOn = false;
}

/** Play the short hover tick (enter/leave). No-op if disabled. */
export function playHover(): void {
  if (!soundEnabled()) return;
  const e = engine;
  if (!e || !e.hoverBuffer) return;
  try {
    if (e.ctx.state === "suspended") e.ctx.resume();
    const src = e.ctx.createBufferSource();
    src.buffer = e.hoverBuffer;
    const g = e.ctx.createGain();
    g.gain.value = HOVER_VOLUME;
    src.connect(g).connect(e.ctx.destination);
    src.start();
  } catch {
    /* ignore */
  }
}

/** Fire the jingle through the engine right now. Assumes the context is
    running; returns false if the buffer/context is unavailable. */
// Decoded-buffer cache keyed by melody URL (so switching melodies doesn't refetch).
const _notifyCache: Map<string, AudioBuffer> = new Map();
const _actionCache: Map<string, AudioBuffer> = new Map();
let _notificationPriorityUntil = 0;

async function loadMelody(e: Engine, url: string): Promise<AudioBuffer | null> {
  const cached = _notifyCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await e.ctx.decodeAudioData(arr);
    _notifyCache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

async function fireNotify(e: Engine): Promise<boolean> {
  const buf = (await loadMelody(e, NOTIFY_URL)) ?? e.notifyBuffer;
  if (!buf) return false;
  try {
    const src = e.ctx.createBufferSource();
    src.buffer = buf;
    const g = e.ctx.createGain();
    g.gain.value = NOTIFY_VOLUME * notifyVolume(); // base * user preference
    src.connect(g).connect(e.ctx.destination);
    src.start();
    return true;
  } catch {
    return false;
  }
}

/** Play the cheerful notification jingle once. Gated by BOTH the master sound
    toggle AND the notification-sound preference.

    Timing/robustness: it is meant to fire the instant the dashboard reports new
    notifications. If that happens right after a user gesture (a click into the
    dashboard, the bell, etc.) the AudioContext is running and it plays at once.
    If the page was opened directly / refreshed, browsers keep the context
    SUSPENDED until the first gesture, so instead of failing silently (playing
    "too early") or never playing, we arm a ONE-SHOT listener that plays it on
    the very next pointer/key/touch — so it lands the moment the user interacts,
    never at a random later time. No-op if either toggle is off. */
export async function playNotify(): Promise<boolean> {
  if (!soundEnabled() || !notifySoundEnabled()) return false;
  if (inDndWindow()) return false; // Do-Not-Disturb quiet window
  const e = await ensureEngine();
  if (!e) return false;

  try {
    if (e.ctx.state === "suspended") await e.ctx.resume();
  } catch {
    /* resume may be blocked until a gesture — handled below */
  }

  if (e.ctx.state === "running") {
    _notificationPriorityUntil = Date.now() + 2200;
    return fireNotify(e);
  }

  // Still suspended (no gesture yet): play on the first user interaction.
  if (typeof window !== "undefined") {
    const onGesture = async () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("touchstart", onGesture);
      // Re-check the prefs at play time in case they changed meanwhile.
      if (!soundEnabled() || !notifySoundEnabled() || inDndWindow()) return;
      try {
        await e.ctx.resume();
      } catch {
        return;
      }
      _notificationPriorityUntil = Date.now() + 2200;
      void fireNotify(e);
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    window.addEventListener("touchstart", onGesture, { once: true });
  }
  return false;
}

/** Play a soft action signal. A notification has priority: action sounds
    requested during its short playback window are suppressed. */
export async function playAction(action: ActionSound): Promise<boolean> {
  if (!soundEnabled() || Date.now() < _notificationPriorityUntil) return false;
  const e = await ensureEngine();
  if (!e) return false;
  try {
    if (e.ctx.state === "suspended") await e.ctx.resume();
    const url = ACTION_URLS[action];
    let buffer = _actionCache.get(url) || null;
    if (!buffer) {
      const res = await fetch(url);
      buffer = await e.ctx.decodeAudioData(await res.arrayBuffer());
      _actionCache.set(url, buffer);
    }
    const src = e.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = e.ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(gain).connect(e.ctx.destination);
    src.start();
    return true;
  } catch {
    return false;
  }
}

/** Turn sound on/off at runtime (used by the toggles). */
export async function applySound(enabled: boolean): Promise<void> {
  setSoundEnabled(enabled);
  if (enabled) {
    // ensure engine exists (gesture context) then start ambient if on landing
    await ensureEngine();
  } else {
    stopAmbient();
  }
}
