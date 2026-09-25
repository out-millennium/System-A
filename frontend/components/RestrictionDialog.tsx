"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useT, useI18n } from "@/lib/i18n";
import { formatRemaining } from "@/lib/duration";
import AppealForm from "@/components/AppealForm";
import type { Restriction } from "@/lib/moderation";

export function buildMessage(
  kind: "ban" | "mute",
  r: Restriction,
  t: (k: string) => string,
  locale: Parameters<typeof formatRemaining>[1]
): { title: string; text: string } {
  const reason = r.reason ?? "—";
  if (kind === "ban") {
    return {
      title: t("moderation.bannedTitle"),
      text: r.permanent
        ? t("moderation.bannedPermanent").replace("{reason}", reason)
        : t("moderation.bannedTemp")
            .replace("{reason}", reason)
            .replace("{time}", r.until ? formatRemaining(r.until, locale) : ""),
    };
  }
  return {
    title: t("moderation.mutedTitle"),
    text: r.permanent
      ? t("moderation.mutedPermanent").replace("{reason}", reason)
      : t("moderation.mutedTemp")
          .replace("{reason}", reason)
          .replace("{time}", r.until ? formatRemaining(r.until, locale) : ""),
  };
}

export default function RestrictionDialog({
  kind,
  restriction,
  onAcknowledge,
  muteOnceKey,
}: {
  kind: "ban" | "mute";
  restriction: Restriction;
  onAcknowledge: () => void;
  // For mutes: a key identifying this mute; if already acknowledged (stored in
  // localStorage), the dialog is suppressed so the user can browse.
  muteOnceKey?: string;
}) {
  const t = useT();
  const { locale } = useI18n();
  const { title, text } = buildMessage(kind, restriction, t as any, locale);

  const [dismissed, setDismissed] = useState(false);

  // Suppress a mute notice that was already acknowledged this browser.
  useEffect(() => {
    if (kind === "mute" && muteOnceKey) {
      try {
        if (localStorage.getItem("ackMute") === muteOnceKey) setDismissed(true);
      } catch {}
    }
  }, [kind, muteOnceKey]);

  // Once a mute notice is acknowledged, don't block the view.
  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="sa-glass w-full max-w-md rounded-[var(--sa-r-lg)] p-8"
        role="alertdialog"
        aria-modal="true"
      >
        <h2 className="sa-heading text-xl text-[var(--sa-danger)]">{title}</h2>
        <p className="sa-lead mt-4 text-sm leading-relaxed">{text}</p>

        <button
          onClick={() => {
            if (kind === "mute") setDismissed(true);
            onAcknowledge();
          }}
          className="sa-btn sa-btn-primary mt-8 w-full"
        >
          {kind === "mute"
            ? t("moderation.viewSite")
            : t("moderation.acknowledge")}
        </button>

        {/* One-time appeal (only when the punishment came from below level 5,
            and no open appeal exists). */}
        <AppealForm variant="compact" />
      </motion.div>
    </motion.div>
  );
}
