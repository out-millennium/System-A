"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

type Item = {
  id: string;
  kind: string;
  status: string | null;
  reason: string | null;
  by: string | null;
  createdAt: string;
};

/* A single "Moderation activity" section for the profile page: warnings,
   bans/mutes, the user's appeals and their deletion/key-revocation requests,
   each with a status. Renders nothing when there is no activity. */
export default function ModerationFeed() {
  const t = useT();
  const [items, setItems] = useState<Item[] | null>(null);
  // The activity item id targeted by the URL hash (#mod-<id>), highlighted
  // briefly so a click-through from a notification lands on the exact record.
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/activity")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.items) setItems(d.items);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // After items render, if the hash targets a specific item, scroll to it and
  // highlight it for a few seconds.
  useEffect(() => {
    if (!items || items.length === 0) return;
    const hash =
      typeof window !== "undefined" ? window.location.hash : "";
    const m = hash.match(/^#mod-(.+)$/);
    if (!m) return;
    const id = m[1];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlight(id);
    const el = document.getElementById(`mod-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setHighlight(null), 3500);
    return () => window.clearTimeout(timer);
  }, [items]);

  // Anchor target for notification click-throughs (#moderation-activity).
  // Render the empty anchor even with no items so the hash always resolves.
  if (!items || items.length === 0) {
    return <div id="moderation-activity" className="scroll-mt-24" />;
  }

  const kindLabel = (kind: string) => {
    if (kind.startsWith("appeal_")) return t("feed.kindAppeal");
    return (
      {
        warning: t("feed.kindWarning"),
        ban: t("feed.kindBan"),
        mute: t("feed.kindMute"),
        unban: t("feed.kindUnban"),
        unmute: t("feed.kindUnmute"),
        deletion: t("feed.kindDeletion"),
        keyRevocation: t("feed.kindKeyRevocation"),
        application: t("feed.kindApplication"),
      } as Record<string, string>
    )[kind] ?? kind;
  };

  const statusLabel = (status: string | null) => {
    if (!status) return null;
    return (
      {
        open: t("feed.statusOpen"),
        active: t("feed.statusActive"),
        revoked: t("feed.statusRevoked"),
        upheld: t("feed.statusUpheld"),
        dismissed: t("feed.statusDismissed"),
        approved: t("feed.statusApproved"),
        rejected: t("feed.statusRejected"),
        withdrawn: t("feed.statusWithdrawn"),
      } as Record<string, string>
    )[status] ?? status;
  };

  const statusColor = (status: string | null) => {
    switch (status) {
      case "upheld":
      case "approved":
      case "revoked":
        return "text-[var(--sa-ok)]";
      case "dismissed":
      case "rejected":
        return "text-[var(--sa-danger)]";
      case "withdrawn":
        return "text-[var(--sa-text-quaternary)]";
      case "open":
        return "text-[var(--sa-text-tertiary)]";
      default:
        return "text-[var(--sa-text-quaternary)]";
    }
  };

  return (
    <section id="moderation-activity" className="sa-card mt-4 scroll-mt-24 p-6 md:p-7">
      <p className="sa-eyebrow mb-4">{t("feed.title")}</p>
      <div className="space-y-2">
        {items.map((it) => (
          <div
            key={it.id}
            id={`mod-${it.id}`}
            className={`scroll-mt-24 rounded-[var(--sa-r-sm)] border px-4 py-3 transition-colors duration-500 ${
              highlight === it.id
                ? "border-[var(--sa-accent,var(--sa-line-strong))] bg-[var(--sa-surface-2)] ring-1 ring-[var(--sa-line-strong)]"
                : "border-[var(--sa-line)] bg-[var(--sa-surface-0)]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-[var(--sa-text)]">
                <span className="text-[var(--sa-text-secondary)]">
                  {kindLabel(it.kind)}
                </span>
                {it.by ? (
                  <span className="ml-2 text-xs text-[var(--sa-text-quaternary)]">
                    {t("feed.by")} {it.by}
                  </span>
                ) : null}
              </p>
              {statusLabel(it.status) && (
                <span
                  className={`shrink-0 text-xs ${statusColor(it.status)}`}
                >
                  {statusLabel(it.status)}
                </span>
              )}
            </div>
            {it.reason && (
              <p className="mt-1 whitespace-pre-line text-xs text-[var(--sa-text-tertiary)]">
                {it.reason}
              </p>
            )}
            <p className="mt-1 text-[0.6875rem] text-[var(--sa-text-quaternary)]">
              {new Date(it.createdAt).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
