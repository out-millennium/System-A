"use client";

import { useState, useCallback, useEffect } from "react";
import { useT } from "@/lib/i18n";
import ConfirmDialog from "@/components/ConfirmDialog";
import AccountPreview, { type PreviewData } from "@/components/AccountPreview";

type HistoryItem = {
  id: string;
  action: string;
  target: string | null;
  reason: string | null;
  until: string | null;
  createdAt: string;
};

/* Admin (level >= 4) UI to ban/mute users and lower-level admins.
   Shows the looked-up user's live status, confirms bans, notifies the target,
   and lists the moderator's recent actions. */
export default function UserModerationPanel() {
  const t = useT();
  const [identifier, setIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Pending punitive action awaiting confirmation in the modal.
  const [pending, setPending] = useState<"ban" | "mute" | null>(null);

  // Live account preview (shared component + /api/account-preview) drives the
  // "can I act on this account?" state used to enable/disable the buttons.
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/admin/moderation");
    if (res.ok) setHistory((await res.json()).history ?? []);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Validate, then either open the confirmation modal (ban/mute) or run now.
  function requestAct(action: "ban" | "mute" | "unban" | "unmute") {
    setError("");
    setMsg("");
    if (!identifier.trim()) return setError(t("usermod.idRequired"));
    if ((action === "ban" || action === "mute") && !reason.trim())
      return setError(t("usermod.reasonRequired"));
    if (action === "ban" || action === "mute") {
      setPending(action); // opens the styled confirmation dialog
      return;
    }
    runAct(action);
  }

  async function runAct(action: "ban" | "mute" | "unban" | "unmute") {
    setError("");
    setMsg("");
    setBusy(true);
    const res = await fetch("/api/admin/moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier,
        action,
        reason,
        hours: hours ? Number(hours) : undefined,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg(`${t(`usermod.applied_${action}`)}: ${identifier}`);
      setReason("");
      setHours("");
      await loadHistory();
      // Refresh the preview card to reflect the new status.
      setRefreshKey((k) => k + 1);
    } else {
      setError(
        d.error === "user_not_found"
          ? t("usermod.userNotFound")
          : d.error === "not_lower"
            ? t("usermod.notLower")
            : d.error === "cannot_self"
              ? t("usermod.cannotSelf")
              : d.error === "reason_required"
                ? t("usermod.reasonRequired")
                : t("usermod.error")
      );
    }
  }

  // Buttons are disabled when the previewed account can't be moderated.
  const cannotAct = preview?.found === true && preview.canModerate === false;

  return (
    <section className="sa-card mt-4 border-[var(--sa-danger)]/30 p-6 md:p-7">
      <p className="sa-eyebrow mb-2 text-[var(--sa-danger)]">
        {t("usermod.userModTitle")}
      </p>
      <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
        {t("usermod.userModLead")}
      </p>

      <div className="space-y-3">
        <input
          className="sa-input"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={t("usermod.identifier")}
        />

        {/* Live account preview (shared) with status + can-moderate check. */}
        <AccountPreview
          identifier={identifier}
          onData={setPreview}
          refreshKey={refreshKey}
        />

        <input
          className="sa-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("usermod.reason")}
        />
        <input
          className="sa-input"
          type="number"
          min={0}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder={t("usermod.hours")}
        />
        {error && <p className="text-sm text-[var(--sa-danger)]">{error}</p>}
        {msg && <p className="text-sm text-[var(--sa-ok)]">{msg}</p>}

        <p className="sa-eyebrow mt-2">{t("usermod.applyGroup")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || cannotAct}
            onClick={() => requestAct("ban")}
            className="sa-btn sa-btn-primary !bg-[var(--sa-danger)] !py-1.5 text-xs disabled:opacity-40"
          >
            {t("usermod.ban")}
          </button>
          <button
            type="button"
            disabled={busy || cannotAct}
            onClick={() => requestAct("mute")}
            className="sa-btn sa-btn-ghost !py-1.5 text-xs disabled:opacity-40"
          >
            {t("usermod.mute")}
          </button>
        </div>

        <p className="sa-eyebrow mt-3">{t("usermod.liftGroup")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => requestAct("unban")}
            className="sa-btn sa-btn-ghost !py-1.5 text-xs"
          >
            {t("usermod.unban")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => requestAct("unmute")}
            className="sa-btn sa-btn-ghost !py-1.5 text-xs"
          >
            {t("usermod.unmute")}
          </button>
        </div>
      </div>

      {/* History of the moderator's own actions */}
      {history.length > 0 && (
        <div className="mt-8">
          <p className="sa-eyebrow mb-3">{t("usermod.historyTitle")}</p>
          <div className="space-y-1">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-3 py-2 text-xs"
              >
                <span className="text-[var(--sa-text-secondary)]">
                  {t(`usermod.applied_${h.action}`)} ·{" "}
                  <span className="sa-mono">{h.target}</span>
                  {h.reason ? ` — ${h.reason}` : ""}
                </span>
                <span className="text-[var(--sa-text-quaternary)]">
                  {new Date(h.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Styled confirmation for punitive actions (burn/logout style). */}
      {pending && (
        <ConfirmDialog
          danger
          title={t(`usermod.confirm_${pending}`).replace("{id}", identifier)}
          description={
            reason
              ? `${t("usermod.reason")}: ${reason}`
              : ""
          }
          confirmLabel={t(`usermod.${pending}`)}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const a = pending;
            setPending(null);
            if (a) runAct(a);
          }}
        />
      )}
    </section>
  );
}
