"use client";

import { usePathname } from "next/navigation";
import LandingHaptics from "@/components/LandingHaptics";
import LandingSound from "@/components/LandingSound";

/* Mounts the ambient-sound + haptic-tap controllers on ALL public pages
   (landing, about, architecture, transparency, api-docs, documents, login,
   register, …) but NOT inside the dashboard, where DashboardSound handles
   hover ticks and there is no ambient hum. Placed once in the root layout so
   the behaviour is consistent across every public route, not only the home
   page. Both controllers are no-ops unless the user enabled sound / haptics. */
export default function PublicChrome() {
  const pathname = usePathname() || "/";
  // The dashboard has its own sound controller and must not get the ambient
  // hum or the landing haptics.
  if (pathname.startsWith("/dashboard")) return null;
  return (
    <>
      <LandingHaptics />
      <LandingSound />
    </>
  );
}
