"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { useFocusTrap } from "@/lib/useFocusTrap";

type Cmd = { id: string; label: string; href: string; hint?: string };

/* ⌘K / Ctrl-K command palette for fast navigation inside the dashboard.
   Keyboard-first: open with ⌘K, filter by typing, ↑/↓ to move, Enter to go,
   Esc to close. Accessible (dialog + focus trap + restore). Admin-only items
   are passed in by the header based on the user's level. */
export default function CommandPalette() {
  const t = useT();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(open, () => setOpen(false));

  // Detect admin once (adds the admin-panel command). Best-effort.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.role === "admin" && d.adminLevel) setIsAdmin(true);
      })
      .catch(() => {});
  }, []);

  const commands: Cmd[] = useMemo(() => {
    const base: Cmd[] = [
      { id: "overview", label: t("dashboard.navOverview"), href: "/dashboard" },
      { id: "grm", label: t("dashboard.navGrm"), href: "/dashboard/grm" },
      { id: "analytics", label: t("dashboard.navAnalytics"), href: "/dashboard/analytics" },
      { id: "messages", label: t("dashboard.navMessages"), href: "/dashboard/messages" },
      { id: "profile", label: t("dashboard.navProfile"), href: "/dashboard/profile" },
      { id: "settings", label: t("dashboard.navSettings"), href: "/dashboard/settings" },
    ];
    if (isAdmin) {
      base.push({
        id: "admin",
        label: t("admin.openPanel"),
        href: "/dashboard/admin",
        hint: t("admin.title"),
      });
    }
    return base;
  }, [t, isAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  // Global shortcut: ⌘K / Ctrl-K toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // focus the input shortly after mount
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const go = useCallback(
    (c: Cmd) => {
      setOpen(false);
      router.push(c.href);
    },
    [router]
  );

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[active];
      if (c) go(c);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] flex items-start justify-center bg-black/70 px-4 pt-[15vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            ref={trapRef}
            initial={reduce ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg overflow-hidden rounded-[var(--sa-r-lg)] border border-[var(--sa-line-strong)] bg-[var(--sa-elevated)] shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("palette.label")}
            onKeyDown={onListKey}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder={t("palette.placeholder")}
              className="w-full border-b border-[var(--sa-line)] bg-transparent px-4 py-3 text-sm text-[var(--sa-text)] outline-none placeholder:text-[var(--sa-text-quaternary)]"
              aria-label={t("palette.placeholder")}
            />
            <ul className="max-h-72 overflow-y-auto p-1" role="listbox">
              {filtered.length === 0 ? (
                <li className="px-3 py-4 text-sm text-[var(--sa-text-tertiary)]">
                  {t("palette.empty")}
                </li>
              ) : (
                filtered.map((c, i) => (
                  <li key={c.id} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(c)}
                      className={`flex w-full items-center justify-between rounded-[var(--sa-r-sm)] px-3 py-2 text-left text-sm transition-colors ${
                        i === active
                          ? "bg-[var(--sa-surface-2)] text-[var(--sa-text)]"
                          : "text-[var(--sa-text-secondary)] hover:bg-[var(--sa-surface-1)]"
                      }`}
                    >
                      <span>{c.label}</span>
                      {c.hint && (
                        <span className="text-xs text-[var(--sa-text-quaternary)]">
                          {c.hint}
                        </span>
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="border-t border-[var(--sa-line)] px-3 py-2 text-[0.6875rem] text-[var(--sa-text-quaternary)]">
              {t("palette.hint")}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
