"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LOCALES, useI18n } from "@/lib/i18n";

/* Compact language selector that blends into the existing nav. It is inline,
   uses the existing tokens, and never shifts surrounding layout — the trigger
   is fixed-width and the menu is absolutely positioned. Switching is instant
   with a subtle fade; the choice persists via the i18n provider. */
export default function LanguageSwitcher({
  align = "right",
}: {
  align?: "left" | "right";
}) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("lang.label")}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="sa-navlink flex items-center gap-1.5 text-xs"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.1" />
          <path
            d="M1.6 8h12.8M8 1.6c1.9 1.7 3 4 3 6.4s-1.1 4.7-3 6.4c-1.9-1.7-3-4-3-6.4s1.1-4.7 3-6.4Z"
            stroke="currentColor"
            strokeWidth="1.1"
          />
        </svg>
        <span className="sa-mono">{current.short}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute top-full z-[60] mt-2 min-w-[9rem] overflow-hidden rounded-[var(--sa-r-md)] border border-[var(--sa-line-strong)] bg-[var(--sa-elevated)] p-1 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.85)] ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {LOCALES.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l.code === locale}
                  onClick={() => {
                    setLocale(l.code);
                    setOpen(false);
                  }}
                  className={`sa-pressable flex w-full items-center justify-between rounded-[var(--sa-r-sm)] px-3 py-2 text-left text-xs transition-colors ${
                    l.code === locale
                      ? "bg-[var(--sa-surface-2)] text-[var(--sa-text)]"
                      : "text-[var(--sa-text-tertiary)] hover:bg-[var(--sa-surface-1)] hover:text-[var(--sa-text)]"
                  }`}
                >
                  <span>{l.label}</span>
                  <span className="sa-mono text-[var(--sa-text-quaternary)]">
                    {l.short}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
