"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LOCALES, useI18n } from "@/lib/i18n";
import { useFocusTrap } from "@/lib/useFocusTrap";

/* First-visit language reveal.

   The server passes a pseudonymous IP decision when it can. That decision is
   authoritative across browsers and survives cookie/localStorage deletion. If
   the server gate is unavailable, the existing localStorage/cookie marker is a
   graceful client-only fallback, so a public landing page never gets blocked by
   the visitor-recognition database.

   The dialog is not shown until the initial viewport entrance animation reports
   completion. Scroll-triggered reveals later on the page are intentionally not
   part of this gate. */

const PROMPTED_KEY = "sa_lang_prompted";
const LANG_KEY = "sa-lang"; // set by the i18n provider when a language is chosen

export default function FirstVisitLanguage({
  serverFirstVisit,
  initialAnimationsComplete,
}: {
  serverFirstVisit?: boolean | null;
  initialAnimationsComplete: boolean;
}) {
  const { locale, setLocale, t } = useI18n();
  const reduce = useReducedMotion();
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [show, setShow] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(show, () => markSeen());

  useEffect(() => {
    let localSeen = false;
    try {
      localSeen =
        localStorage.getItem(PROMPTED_KEY) === "1" ||
        Boolean(localStorage.getItem(LANG_KEY));
    } catch {
      // If browser storage is blocked, the server decision is still usable.
    }

    // A previous local choice always wins. Otherwise false from the server
    // suppresses the prompt across browsers for this IP; null falls back to the
    // legacy browser-only behavior.
    if (localSeen || serverFirstVisit === false) setEligible(false);
    else setEligible(true);
  }, [serverFirstVisit]);

  useEffect(() => {
    if (!eligible || !initialAnimationsComplete) return;
    // A frame boundary lets the completed hero animation paint before the modal
    // backdrop fades in, avoiding a flash over the final entrance frame.
    const frame = window.requestAnimationFrame(() => setShow(true));
    return () => window.cancelAnimationFrame(frame);
  }, [eligible, initialAnimationsComplete]);

  function markSeen() {
    try {
      localStorage.setItem(PROMPTED_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center px-6"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Dimming backdrop — click to dismiss. */}
          <motion.button
            type="button"
            aria-label={t("lang.promptDismiss")}
            onClick={markSeen}
            className="sa-pressable absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Chooser panel. */}
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="first-visit-language-title"
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : 0.08 }}
            className="relative w-full max-w-sm rounded-[var(--sa-r-lg)] border border-[var(--sa-line-strong)] bg-[var(--sa-elevated)] p-7 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]"
          >
            <div className="mb-1 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="6.4" stroke="var(--sa-accent, currentColor)" strokeWidth="1.1" />
                <path
                  d="M1.6 8h12.8M8 1.6c1.9 1.7 3 4 3 6.4s-1.1 4.7-3 6.4c-1.9-1.7-3-4-3-6.4s1.1-4.7 3-6.4Z"
                  stroke="var(--sa-accent, currentColor)"
                  strokeWidth="1.1"
                />
              </svg>
              <p className="sa-eyebrow">{t("lang.label")}</p>
            </div>
            <h2 id="first-visit-language-title" className="sa-heading text-2xl">{t("lang.prompt")}</h2>
            <p className="mt-2 text-xs text-[var(--sa-text-tertiary)]">
              {t("lang.promptLead")}
            </p>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-[var(--sa-text-quaternary)]">
              {t("lang.promptPrivacy")}
            </p>

            <ul className="mt-6 grid gap-2" role="listbox" aria-label={t("lang.label")}>
              {LOCALES.map((l, i) => (
                <motion.li
                  key={l.code}
                  initial={reduce ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduce ? 0 : 0.15 + i * 0.05, duration: reduce ? 0 : 0.35 }}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={l.code === locale}
                    onClick={() => {
                      setLocale(l.code);
                      markSeen();
                    }}
                    className={`sa-pressable flex w-full items-center justify-between rounded-[var(--sa-r-md)] border px-4 py-3 text-left text-sm transition-colors ${
                      l.code === locale
                        ? "border-[var(--sa-line-strong)] bg-[var(--sa-surface-2)] text-[var(--sa-text)]"
                        : "border-[var(--sa-line)] text-[var(--sa-text-secondary)] hover:border-[var(--sa-line-strong)] hover:bg-[var(--sa-surface-1)] hover:text-[var(--sa-text)]"
                    }`}
                  >
                    <span>{l.label}</span>
                    <span className="sa-mono text-xs text-[var(--sa-text-quaternary)]">
                      {l.short}
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>

            <button
              type="button"
              onClick={markSeen}
              className="sa-navlink mt-5 text-xs"
            >
              {t("lang.promptDismiss")}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
