"use client";

import { useEffect, useState } from "react";
import { hapticsEnabled, setHapticsEnabled, vibrate } from "@/lib/haptics";
import { useT } from "@/lib/i18n";

/* Dashboard setting: turn landing-page haptic feedback (mobile vibration) on or
   off. The preference is stored in localStorage and read by lib/haptics. */
export default function HapticsToggle() {
  const t = useT();
  const [enabled, setEnabled] = useState(true);
  // Only show this control where haptic feedback can actually happen. Desktop
  // browsers (and iOS Safari) have no navigator.vibrate, so the toggle would be
  // meaningless there — hide it entirely on the web. `null` = unknown until the
  // client checks (avoids SSR/first-paint flash on unsupported devices).
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(hapticsEnabled());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(
      typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
    );
  }, []);

  // Not rendered until we know support, and never rendered without vibration.
  if (supported !== true) return null;

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setHapticsEnabled(next);
    if (next) vibrate(15); // give immediate feedback when enabling
  }

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-2">{t("settings.hapticsTitle")}</p>
      <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
        {t("settings.hapticsLead")}
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className="sa-pressable flex items-center gap-3"
      >
        <span
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          style={{
            background: enabled ? "var(--sa-ok, #4ea36b)" : "var(--sa-line-strong)",
          }}
        >
          <span
            className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
            style={{ transform: enabled ? "translateX(22px)" : "translateX(4px)" }}
          />
        </span>
        <span className="text-sm text-[var(--sa-text-secondary)]">
          {enabled ? t("settings.hapticsOn") : t("settings.hapticsOff")}
        </span>
      </button>
    </section>
  );
}
