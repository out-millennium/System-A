"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

/* Shared one-time appeal against the current ban/mute. Talks to
   /api/auth/appeal-moderation (which routes the appeal to an admin strictly
   above the punisher; a warnings-mute goes to level 4, and a level-4-issued
   punishment goes to another level-4 admin). Only one open appeal is allowed.

   Rendered inline wherever the user is told about their restriction: the
   sign-in dialog, the login/register gate, and the profile status card. */
export default function AppealForm({
  variant = "inline",
}: {
  variant?: "inline" | "compact";
}) {
  const t = useT();
  const [appealable, setAppealable] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/appeal-moderation")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d) return;
        setAppealable(Boolean(d.appealable));
        if (d.alreadyFiled) setSent(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    const res = await fetch("/api/auth/appeal-moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (res.ok) {
      setSent(true);
      setShowForm(false);
    }
  }

  if (sent) {
    return (
      <p className="mt-4 text-sm text-[var(--sa-ok)]">
        {t("moderation.appealSent")}
      </p>
    );
  }
  if (!appealable) return null;

  if (showForm) {
    return (
      <div className="mt-4 space-y-2">
        <textarea
          className="sa-textarea w-full text-sm"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("moderation.appealReason")}
        />
        <button
          type="button"
          disabled={busy || !reason.trim()}
          onClick={submit}
          className="sa-btn sa-btn-ghost w-full disabled:opacity-40"
        >
          {t("moderation.appealSubmit")}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowForm(true)}
      className={
        variant === "compact"
          ? "mt-3 w-full text-center text-xs text-[var(--sa-text-quaternary)] underline-offset-4 transition-colors hover:text-[var(--sa-text-secondary)] hover:underline"
          : "sa-btn sa-btn-ghost mt-4 w-full"
      }
    >
      {t("moderation.appeal")}
    </button>
  );
}
