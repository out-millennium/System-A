"use client";

import { useEffect } from "react";
import { soundEnabled, playHover } from "@/lib/sound";

/* Dashboard sound: hover ticks only (NO ambient hum here — the drone belongs to
   the landing/public pages). Plays a short tick ONLY when the pointer enters a
   NEW control (link/button); moving between the inner parts of the same control
   does not re-trigger it, and there is no tick on leave. Needs a prior user
   gesture to unlock audio, which any click in the dashboard provides. */
export default function DashboardSound() {
  useEffect(() => {
    const closestControl = (el: EventTarget | null): Element | null =>
      el instanceof HTMLElement
        ? el.closest("a, button, [role='button']")
        : null;

    let currentControl: Element | null = null;

    const onOver = (e: Event) => {
      const control = closestControl(e.target);
      if (control && control !== currentControl) {
        currentControl = control;
        if (soundEnabled()) playHover();
      }
    };
    const onOut = (e: Event) => {
      if (!currentControl) return;
      const to = (e as PointerEvent).relatedTarget;
      if (to instanceof Node && currentControl.contains(to)) return;
      currentControl = null;
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
    };
  }, []);
  return null;
}
