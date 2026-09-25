/* Lightweight haptic feedback (mobile vibration) for the landing page.

   Uses the Vibration API (navigator.vibrate). Supported on Android/Chromium
   browsers; iOS Safari does not support it and simply no-ops — safe to call
   anywhere. Respects a user setting stored in localStorage so it can be turned
   off from the dashboard settings. Enabled by default. */

const STORAGE_KEY = "sa_haptics";

/** Is haptic feedback enabled? Defaults to true when never set. SSR-safe. */
export function hapticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Persist the on/off preference. */
export function setHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* storage may be blocked; ignore */
  }
}

/** Fire a short vibration (ms) if enabled and supported. Never throws. */
export function vibrate(pattern: number | number[] = 10): void {
  if (typeof window === "undefined") return;
  if (!hapticsEnabled()) return;
  try {
    // navigator.vibrate is absent on unsupported browsers (e.g. iOS Safari).
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    nav.vibrate?.(pattern);
  } catch {
    /* no-op */
  }
}
