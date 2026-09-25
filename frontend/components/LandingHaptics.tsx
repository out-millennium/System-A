"use client";

import { useEffect } from "react";
import { vibrate } from "@/lib/haptics";

/* Adds a short haptic tap when the user presses a button or link on the landing
   page (mobile only — desktop browsers ignore the Vibration API). Implemented as
   a single delegated listener so no individual button needs changes. Respects
   the user's haptics setting (see lib/haptics + dashboard settings). Mounted
   only on the landing page. */
export default function LandingHaptics() {
  useEffect(() => {
    const onPointerDown = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      // Vibrate for interactive elements: links, buttons, or role="button".
      const interactive = el.closest("a, button, [role='button']");
      if (interactive) vibrate(10);
    };
    // pointerdown fires before navigation, so the tap is felt immediately.
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  return null;
}
