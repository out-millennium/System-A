"use client";

import { useEffect } from "react";

/* Global guard: stop the mouse wheel from changing <input type="number"> values.

   By default browsers increment/decrement a focused number input when the wheel
   scrolls over it — an easy way to silently alter an amount (e.g. a transfer or
   moderation duration) while the user only meant to scroll the page. We blur the
   number input on wheel so the gesture scrolls the page instead of mutating the
   value. Mounted once at the app root. */
export default function NoNumberWheel() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        el instanceof HTMLInputElement &&
        el.type === "number" &&
        document.activeElement === el
      ) {
        // Drop focus so the wheel no longer targets the spinner; the page keeps
        // scrolling normally.
        el.blur();
      }
    };
    // Passive listener — we don't preventDefault, we just blur.
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
