"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { useT } from "@/lib/i18n";

/* Password field with a show/hide (eye) toggle.
   No native browser validation (no `required` / `minLength`) — all checks and
   messages are handled in-app so they always appear under the field in the
   selected page language. Reuses the project's `.sa-input` styling. */
type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoComplete?: string;
  id?: string;
  name?: string;
  placeholder?: string;
};

export default function PasswordInput({
  value,
  onChange,
  className = "",
  autoComplete,
  id,
  name,
  placeholder,
}: Props) {
  const t = useT();
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        id={id}
        name={name}
        className={`sa-input pr-11 ${className}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
        title={visible ? t("auth.hidePassword") : t("auth.showPassword")}
        className="sa-pressable absolute inset-y-0 right-0 flex items-center px-3 text-[var(--sa-text-quaternary)] transition-colors hover:text-[var(--sa-text-secondary)]"
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={visible ? "visible" : "hidden"}
            className="inline-flex"
            initial={reduce ? false : { opacity: 0, scale: 0.72, rotate: visible ? -18 : 18 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.72, rotate: visible ? 18 : -18 }}
            transition={{ duration: reduce ? 0 : 0.17, ease: [0.22, 1, 0.36, 1] }}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
      <path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 8 11 8a9.12 9.12 0 0 0 5.39-1.61" />
    </svg>
  );
}
