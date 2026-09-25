"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { useFocusTrap } from "@/lib/useFocusTrap";

/* On dashboard entry, if the user has unread admin messages, show a site-style
   modal notice (mirrors the ban/mute dialog, NOT a browser alert). "OK" closes
   it; a link jumps to the messages page. The notice is remembered per newest
   unread-message id so it doesn't reappear on every navigation, but a brand-new
   message re-triggers it. */
export default function MessagesNotice() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [ackKey, setAckKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/messages", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d) return;
        const unread = (d.messages ?? []).filter(
          (m: { read: boolean }) => !m.read
        );
        if (unread.length === 0) return;
        // Key on the newest unread message id so a new message re-shows.
        const key = unread[0]?.id ?? String(unread.length);
        let seen: string | null = null;
        try {
          seen = localStorage.getItem("seenUnreadMsgKey");
        } catch {}
        if (seen === key) return;
        setCount(unread.length);
        setAckKey(key);
        setOpen(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function dismiss() {
    if (ackKey) {
      try {
        localStorage.setItem("seenUnreadMsgKey", ackKey);
      } catch {}
    }
    setOpen(false);
  }

  const reduce = useReducedMotion();
  const titleId = useId();
  const bodyId = useId();
  const trapRef = useFocusTrap<HTMLDivElement>(open, dismiss);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
        >
          <motion.div
            ref={trapRef}
            initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="sa-glass w-full max-w-md rounded-[var(--sa-r-lg)] p-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            tabIndex={-1}
          >
            <h2 id={titleId} className="sa-heading text-xl">
              {t("messages.noticeTitle")}
            </h2>
            <p id={bodyId} className="sa-lead mt-4 text-sm leading-relaxed">
              {t("messages.noticeBody").replace("{n}", String(count))}
            </p>

            <Link
              href="/dashboard/messages"
              onClick={dismiss}
              className="sa-btn sa-btn-primary mt-8 block w-full text-center"
            >
              {t("messages.noticeOpen")}
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="sa-btn sa-btn-ghost mt-3 w-full"
            >
              {t("moderation.acknowledge")}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
