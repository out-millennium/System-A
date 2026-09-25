"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { useT } from "@/lib/i18n";

/* Small icon button that copies `value` to the clipboard and briefly shows a
   confirmation. Reusable across the dashboard (account name, API key, etc.). */
export default function CopyButton({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable (insecure context) */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? t("auth.copiedLabel") : t("auth.copyLabel")}
      title={copied ? t("auth.copiedLabel") : t("auth.copyLabel")}
      className={`sa-pressable inline-flex items-center gap-1 text-xs text-[var(--sa-text-quaternary)] transition-colors hover:text-[var(--sa-text-secondary)] ${className}`}
    >
      <span className="relative inline-flex h-[13px] w-[13px] shrink-0">
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={copied ? "copied" : "copy"}
            className="absolute inset-0 inline-flex"
            initial={reduce ? false : { opacity: 0, scale: 0.7, rotate: copied ? -18 : 18 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, rotate: copied ? 18 : -18 }}
            transition={{ duration: reduce ? 0 : 0.17, ease: [0.22, 1, 0.36, 1] }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </motion.span>
        </AnimatePresence>
      </span>
      <span>{copied ? t("auth.copiedLabel") : t("auth.copyLabel")}</span>
    </button>
  );
}

function CopyIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
