"use client";

import { useEffect } from "react";
import { soundEnabled, startAmbient, stopAmbient, playHover } from "@/lib/sound";

/* Landing-page sound controller:
   • Starts the ambient hum (if the user enabled sound) on the first user
     interaction — browsers block autoplay until a gesture.
   • Plays a short hover tick ONLY when the pointer genuinely enters a NEW
     control (link/button). Moving the pointer between the inner parts of the
     same card (e.g. from the padding onto the label text) must NOT re-trigger
     the tick — otherwise a single card feels like it has several tap spots.
     We therefore track the last interactive ancestor and fire only on change.
   • No tick on leave — only on hover-in (per design).
   • Pauses the ambient hum when the tab is hidden or the window loses focus,
     and resumes it when the user comes back (if sound is still enabled).
   A single delegated listener covers all controls, so no button needs changes.
   Mounted on all public pages via the layout (never in the dashboard). */
export default function LandingSound() {
  useEffect(() => {
    let started = false;
    const tryStart = () => {
      if (started) return;
      started = true;
      // Only starts if the user turned sound on; otherwise a no-op.
      startAmbient();
    };
    // Any first gesture unlocks/starts ambient.
    const onFirst = () => {
      tryStart();
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
    if (soundEnabled()) {
      window.addEventListener("pointerdown", onFirst, { once: false });
      window.addEventListener("keydown", onFirst, { once: false });
    }

    const closestControl = (el: EventTarget | null): Element | null =>
      el instanceof HTMLElement
        ? el.closest("a, button, [role='button']")
        : null;

    // The control the pointer is currently considered "inside". Prevents the
    // tick from re-firing on child-to-child pointerover within the same card.
    let currentControl: Element | null = null;

    const onOver = (e: Event) => {
      const control = closestControl(e.target);
      if (control && control !== currentControl) {
        currentControl = control;
        playHover();
      }
    };
    const onOut = (e: Event) => {
      // Only clear when actually leaving the current control (not when moving
      // onto one of its children). relatedTarget is where the pointer went.
      if (!currentControl) return;
      const to = (e as PointerEvent).relatedTarget;
      if (to instanceof Node && currentControl.contains(to)) return;
      currentControl = null; // left the control entirely — no leave tick
    };
    // pointerover/out bubble (unlike enter/leave), so delegation works.
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);

    // Pause/resume ambient with tab visibility and window focus so nothing
    // keeps playing while the user is looking at another tab or app.
    const onVisibility = () => {
      if (document.hidden) {
        stopAmbient();
      } else if (soundEnabled() && started) {
        startAmbient();
      }
    };
    const onBlur = () => stopAmbient();
    const onFocus = () => {
      if (soundEnabled() && started && !document.hidden) startAmbient();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return null;
}
