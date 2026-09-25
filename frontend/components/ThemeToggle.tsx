"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "./ThemeProvider";
import { useT } from "@/lib/i18n";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const t = useT();
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      onClick={toggle}
      className="sa-navlink flex items-center gap-2 text-xs transition-transform active:scale-[0.96]"
      title={t("theme.toggle")}
      aria-label={t("theme.toggle")}
      aria-pressed={theme === "contrast"}
    >
      {/* The icon crossfades/rotates instead of changing abruptly when the
          contrast theme is toggled. */}
      <span className="relative inline-flex h-[15px] w-[15px] shrink-0">
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={theme}
            className="absolute inset-0 inline-flex items-center justify-center"
            initial={reduce ? false : { opacity: 0, scale: 0.7, rotate: -24 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, rotate: 24 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {theme === "dark" ? (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.2" />
                <path
                  d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.7 3.3l-1 1M4.3 11.7l-1 1M12.7 12.7l-1-1M4.3 4.3l-1-1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="hidden sm:inline">
        {theme === "dark" ? t("theme.contrast") : t("theme.standard")}
      </span>
    </button>
  );
}
