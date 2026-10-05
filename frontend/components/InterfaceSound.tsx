"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { playAction, playHover } from "@/lib/sound";

/** Global, lightweight feedback layer for System A. Existing forms already emit
 * semantic action sounds; this layer fills the quiet gaps across dashboard and
 * public UI with a soft press tick and a short route-transition resolution. */
export default function InterfaceSound() {
  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    if (previousPath.current !== null && previousPath.current !== pathname) {
      void playAction("confirm");
    }
    previousPath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const control = target.closest("button, a, [role='button'], summary");
      if (!control || control.hasAttribute("disabled") || control.getAttribute("aria-disabled") === "true") return;
      if (control.closest("[data-no-interface-sound='true']")) return;
      playHover();
    };
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return null;
}
