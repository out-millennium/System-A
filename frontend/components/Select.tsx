"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export type SelectOption = { value: string; label: string };

/* Site-styled, rounded, animated select — replaces the native browser <select>
   (which cannot be styled consistently across browsers). Fully keyboard
   accessible (Enter/Space/↑/↓/Home/End/Esc, type-ahead), closes on outside
   click, respects prefers-reduced-motion, and never shifts layout (menu is
   absolutely positioned). Values/labels match the native contract so callers
   just swap <select> → <Select>. */
export default function Select({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
  disabled = false,
  buttonClassName = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  buttonClassName?: string;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      const i = options.findIndex((o) => o.value === value);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(i >= 0 ? i : 0);
    }
  }, [open, value, options]);

  function commit(i: number) {
    const opt = options[i];
    if (opt) onChange(opt.value);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(active);
    } else if (e.key.length === 1) {
      // type-ahead: jump to first option whose label starts with the key
      const k = e.key.toLowerCase();
      const idx = options.findIndex((o) => o.label.toLowerCase().startsWith(k));
      if (idx >= 0) setActive(idx);
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKey}
        className={`sa-pressable sa-select flex w-full items-center justify-between gap-2 text-left ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        } ${buttonClassName}`}
      >
        <span className="truncate">{current?.label ?? ""}</span>
        <motion.svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="shrink-0 text-[var(--sa-text-tertiary)]"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="listbox"
            aria-activedescendant={`${listId}-${active}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 top-full z-[70] mt-2 max-h-64 overflow-auto rounded-[var(--sa-r-md)] border border-[var(--sa-line-strong)] bg-[var(--sa-elevated)] p-1 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.85)]"
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(i)}
                className={`sa-pressable flex cursor-pointer items-center justify-between gap-2 rounded-[var(--sa-r-sm)] px-3 py-2 text-sm transition-colors ${
                  i === active
                    ? "bg-[var(--sa-surface-2)] text-[var(--sa-text)]"
                    : "text-[var(--sa-text-secondary)]"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && (
                  <motion.svg
                    initial={reduce ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    width="13"
                    height="13"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden
                    className="shrink-0 text-[var(--sa-ok,#4ea36b)]"
                  >
                    <path d="M3 8.5l3.2 3.2L13 4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </motion.svg>
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
