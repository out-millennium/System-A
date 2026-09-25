"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { soundEnabled, applySound, startAmbient } from "@/lib/sound";
import { useT } from "@/lib/i18n";

/* Small speaker-icon toggle for the landing top bar. Turning sound ON also
   starts the ambient hum immediately (this click is a valid user gesture, so
   autoplay is allowed). OFF stops it. */
export default function SoundToggle() {
  const t = useT();
  const [on, setOn] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(soundEnabled());
  }, []);

  async function toggle() {
    const next = !on;
    setOn(next);
    await applySound(next);
    if (next) startAmbient(); // gesture context → ambient can start now
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="sa-navlink flex items-center gap-2 text-xs transition-transform active:scale-[0.96]"
      title={on ? t("sound.on") : t("sound.off")}
      aria-label={on ? t("sound.on") : t("sound.off")}
      aria-pressed={on}
    >
      {/* Crossfade the speaker state so the mute/unmute change is not abrupt. */}
      <span className="relative inline-flex h-[15px] w-[15px] shrink-0">
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={on ? "on" : "off"}
            className="absolute inset-0 inline-flex items-center justify-center"
            initial={reduce ? false : { opacity: 0, scale: 0.75, rotate: on ? -12 : 12 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.75, rotate: on ? 12 : -12 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {on ? (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 6v4h2.5L8 13V3L4.5 6H2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M10.5 5.5a3 3 0 0 1 0 5M12.2 3.8a5.4 5.4 0 0 1 0 8.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 6v4h2.5L8 13V3L4.5 6H2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M11 6.5l3 3M14 6.5l-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            )}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="hidden sm:inline">
        {on ? t("sound.labelOn") : t("sound.labelOff")}
      </span>
    </button>
  );
}
