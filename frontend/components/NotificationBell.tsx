"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useT } from "@/lib/i18n";

type Notif = {
  id: string;
  title: string;
  body: string;
  href?: string;
  createdAt: string;
};

const SEEN_KEY = "sa_notify_seen_ts";
// How many notifications to show before collapsing into an "and N more" row.
const SHOW = 3;

/* Bell in the dashboard header. Shows a badge with the number of notifications
   newer than the last time the menu was opened (tracked in localStorage). The
   dropdown lists the latest few receipts and, when there are more than SHOW + 1,
   a top "and N more" row that opens the full moderation activity. Clicking a
   row jumps to that item in the profile. */
export default function NotificationBell() {
  const t = useT();
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [total, setTotal] = useState(0);
  const [href, setHref] = useState("/dashboard/profile#moderation-activity");
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState(0);
  // Unread ADMIN direct messages (real mail). Folded into the badge so the bell
  // means "you have something new" — unread mail OR fresh decisions.
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [nRes, mRes] = await Promise.all([
        fetch("/api/auth/notifications", { cache: "no-store" }),
        fetch("/api/messages", { cache: "no-store" }),
      ]);

      let freshNotifs = 0;
      if (nRes.ok) {
        const d = await nRes.json();
        const list: Notif[] = d.notifications ?? [];
        setItems(list);
        setTotal(d.total ?? list.length);
        if (d.href) setHref(d.href);
        // Prefer the SERVER-side "last opened" timestamp (consistent across
        // devices). Fall back to the per-device localStorage value if the
        // server hasn't recorded one yet.
        let seenTs = 0;
        if (d.seenAt) {
          seenTs = new Date(d.seenAt).getTime();
        } else {
          try {
            seenTs = Number(localStorage.getItem(SEEN_KEY) || "0");
          } catch {}
        }
        freshNotifs = list.filter(
          (n) => new Date(n.createdAt).getTime() > seenTs
        ).length;
      }

      let unread = 0;
      if (mRes.ok) {
        const md = await mRes.json();
        unread = md.unread ?? 0;
      }
      setUnreadMsgs(unread);
      // The badge reflects both: unread admin mail + fresh decision notifications.
      setBadge(unread + freshNotifs);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh when the tab regains focus (a decision may have landed elsewhere).
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Opening marks the decision-notifications as seen (remember newest time),
      // but unread ADMIN messages keep counting until actually read on the
      // messages page.
      const newest = items[0]
        ? new Date(items[0].createdAt).getTime()
        : Date.now();
      try {
        localStorage.setItem(SEEN_KEY, String(newest));
      } catch {}
      // Persist "seen" on the server too (cross-device). Fire-and-forget.
      fetch("/api/auth/notifications", { method: "PATCH" }).catch(() => {});
      setBadge(unreadMsgs);
    }
  }

  function go(target: string) {
    setOpen(false);
    router.push(target);
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString();

  // When there are more than SHOW + 1 items, collapse extras behind an
  // "and N more" row shown ABOVE the latest three.
  const collapsed = items.length > SHOW + 1;
  const visible = collapsed ? items.slice(0, SHOW) : items.slice(0, SHOW + 1);
  const moreCount = total - visible.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={t("notifBell.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="sa-navlink relative flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
      >
        {/* Bell icon: gives a small "ring" wiggle while there are unseen
            notifications, then rests. */}
        <motion.svg
          width="17"
          height="17"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
          style={{ originY: 0.15 }}
          animate={
            badge > 0
              ? { rotate: [0, -12, 10, -8, 6, -3, 0] }
              : { rotate: 0 }
          }
          transition={
            badge > 0
              ? { duration: 0.9, ease: "easeInOut", repeat: Infinity, repeatDelay: 2.5 }
              : { duration: 0.2 }
          }
        >
          <path
            d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5c0 3.2-1 4.7-1.7 5.5-.3.3-.1.9.4.9h11.6c.5 0 .7-.6.4-.9-.7-.8-1.7-2.3-1.7-5.5A4.5 4.5 0 0 0 10 2.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M8.4 16.5a1.8 1.8 0 0 0 3.2 0"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </motion.svg>
        <AnimatePresence>
          {badge > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sa-danger)] px-1 text-[0.6rem] font-semibold leading-none text-white"
            >
              {badge > 9 ? "9+" : badge}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-[60] mt-2 w-80 max-w-[90vw] overflow-hidden rounded-[var(--sa-r-md)] border border-[var(--sa-line-strong)] bg-[var(--sa-elevated)] p-1 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.85)]"
          >
            <p className="px-3 py-2 text-[0.6875rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
              {t("notifBell.title")}
            </p>

            {/* Unread admin mail — always on top when present, links to inbox. */}
            {unreadMsgs > 0 && (
              <button
                type="button"
                onClick={() => go("/dashboard/messages")}
                className="sa-pressable flex w-full items-center justify-between rounded-[var(--sa-r-sm)] px-3 py-2 text-left transition-colors hover:bg-[var(--sa-surface-1)]"
              >
                <span className="text-sm text-[var(--sa-text)]">
                  {t("notifBell.unreadMessages").replace(
                    "{n}",
                    String(unreadMsgs)
                  )}
                </span>
                <span className="text-[var(--sa-text-quaternary)]">→</span>
              </button>
            )}

            {items.length === 0 && unreadMsgs === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--sa-text-tertiary)]">
                {t("notifBell.empty")}
              </p>
            ) : items.length === 0 ? null : (
              <>
                {/* "and N more" row sits on top when the list is collapsed. */}
                {collapsed && moreCount > 0 && (
                  <button
                    type="button"
                    onClick={() => go(href)}
                    className="sa-pressable flex w-full items-center justify-between rounded-[var(--sa-r-sm)] px-3 py-2 text-left text-xs text-[var(--sa-text-tertiary)] transition-colors hover:bg-[var(--sa-surface-1)] hover:text-[var(--sa-text)]"
                  >
                    <span>
                      {t("notifBell.more").replace("{n}", String(moreCount))}
                    </span>
                    <span>→</span>
                  </button>
                )}
                {visible.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => go(n.href || href)}
                    className="sa-pressable block w-full rounded-[var(--sa-r-sm)] px-3 py-2 text-left transition-colors hover:bg-[var(--sa-surface-1)]"
                  >
                    <span className="block truncate text-sm text-[var(--sa-text)]">
                      {n.title}
                    </span>
                    <span className="mt-0.5 block text-[0.6875rem] text-[var(--sa-text-quaternary)]">
                      {fmt(n.createdAt)}
                    </span>
                  </button>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
