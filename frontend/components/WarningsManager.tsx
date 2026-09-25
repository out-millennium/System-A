"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import ConfirmDialog from "@/components/ConfirmDialog";
import AccountPreview, { type PreviewData } from "@/components/AccountPreview";

type Received = {
  id: string;
  reason: string;
  from: string | null;
  revoked: boolean;
  createdAt: string;
  hasComplaint: boolean;
};
type Issued = {
  id: string;
  reason: string;
  to: string | null;
  revoked: boolean;
  createdAt: string;
};
type Appeal = {
  id: string;
  reason: string;
  by: string | null;
  warningReason: string;
  createdAt: string;
};

/* Stage 4 admin UI: issue warnings (level >= 3), see/appeal received warnings
   (any admin, even when muted), and review appeals (level >= 4). */
export default function WarningsManager({ level }: { level: number }) {
  const t = useT();
  const { toast } = useToast();
  const [received, setReceived] = useState<Received[]>([]);
  const [issued, setIssued] = useState<Issued[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("");
  // Live preview of the target account; drives whether the mute-hours field
  // (only relevant for the muting 3rd warning) is shown.
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingResolve, setPendingResolve] = useState<{
    id: string;
    action: "uphold" | "dismiss";
  } | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [appealFor, setAppealFor] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState("");

  const load = useCallback(async () => {
    const w = await fetch("/api/admin/warnings");
    if (w.ok) {
      const d = await w.json();
      setReceived(d.received ?? []);
      setIssued(d.issued ?? []);
    }
    if (level === 4) {
      const c = await fetch("/api/admin/complaints");
      if (c.ok) setAppeals((await c.json()).complaints ?? []);
    }
  }, [level]);

  useEffect(() => {
    load();
  }, [load]);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!target.trim()) return setError(t("warnings.targetRequired"));
    if (!reason.trim()) return setError(t("warnings.reasonRequired"));
    setBusy(true);
    const res = await fetch("/api/admin/warnings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target,
        reason,
        hours: hours ? Number(hours) : undefined,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setTarget("");
      setReason("");
      setHours("");
      await load();
      toast(
        d.muted ? t("warnings.mutedNow") : t("warnings.issued"),
        "success",
        { sound: "negative" }
      );
    } else {
      setError(
        d.error === "user_not_found"
          ? t("warnings.userNotFound")
          : d.error === "cannot_self"
            ? t("warnings.cannotSelf")
          : d.error === "not_an_admin"
            ? t("warnings.notAnAdmin")
          : d.error === "not_lower"
            ? t("warnings.notLower")
            : d.error === "already_capped"
              ? t("warnings.alreadyCapped")
              : d.error === "hours_required"
                ? t("warnings.hoursRequired")
                : d.error === "hours_too_long"
                  ? t("warnings.hoursTooLong")
                  : t("warnings.error")
      );
    }
  }

  async function submitAppeal(warningId: string) {
    if (!appealReason.trim()) return setError(t("warnings.reasonRequired"));
    setBusy(true);
    const res = await fetch("/api/admin/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warningId, reason: appealReason }),
    });
    setBusy(false);
    setAppealFor(null);
    setAppealReason("");
    await load();
    if (!res.ok) setError(t("warnings.error"));
    else toast(t("notif.appealSubmitted"), "success", { sound: "important" });
  }

  async function resolve(
    id: string,
    action: "uphold" | "dismiss",
    reviewNote?: string
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/complaints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          reviewNote: action === "dismiss" ? reviewNote : undefined,
        }),
      });
      if (!res.ok) {
        setError(t("warnings.error"));
        return;
      }
      await load();
      toast(t("notif.resolved"), "success", { sound: "important" });
    } catch {
      setError(t("warnings.error"));
    } finally {
      setBusy(false);
    }
  }

  // The most recent non-revoked received warning is the one that can be appealed.
  const latestAppealable = received.find((w) => !w.revoked && !w.hasComplaint);

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-2">{t("warnings.title")}</p>

      {/* Issue (level >= 3) */}
      {level >= 3 && (
        <form onSubmit={issue} className="mb-8 space-y-3">
          <p className="text-xs text-[var(--sa-text-tertiary)]">
            {t("warnings.issueLead")}
          </p>
          <input
            className="sa-input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={t("warnings.target")}
          />
          {/* Live account-state preview under the target field. */}
          <AccountPreview identifier={target} onData={setPreview} />
          <textarea
            className="sa-textarea w-full"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("warnings.reason")}
          />
          {/* The mute-hours field is only for the muting (3rd) warning, so it
              appears only once the preview says the next warning is the third. */}
          {preview?.found && preview.nextIsThird && (
            <>
              <input
                className="sa-input"
                type="number"
                min={1}
                max={720}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder={t("warnings.muteHours")}
              />
              <p className="text-xs text-[var(--sa-text-quaternary)]">
                {t("warnings.muteHoursHint")}
              </p>
            </>
          )}
          {error && <p className="text-sm text-[var(--sa-danger)]">{error}</p>}
          <button type="submit" disabled={busy} className="sa-btn sa-btn-primary">
            {busy ? t("warnings.issuing") : t("warnings.issue")}
          </button>
        </form>
      )}

      {/* Appeals to review (level 4 only) */}
      {level === 4 && (
        <div className="mb-8">
          <p className="sa-eyebrow mb-3">{t("warnings.reviewTitle")}</p>
          {appeals.length === 0 ? (
            <p className="text-sm text-[var(--sa-text-tertiary)]">
              {t("warnings.noAppeals")}
            </p>
          ) : (
            <div className="space-y-3">
              {appeals.map((a) => (
                <div
                  key={a.id}
                  className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-4"
                >
                  <p className="text-xs text-[var(--sa-text-quaternary)]">
                    {a.by} · “{a.warningReason}”
                  </p>
                  <p className="mt-1 text-sm text-[var(--sa-text)]">{a.reason}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingResolve({ id: a.id, action: "uphold" })}
                      className="sa-btn sa-btn-primary !py-1.5 text-xs"
                    >
                      {t("warnings.uphold")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingResolve({ id: a.id, action: "dismiss" })}
                      className="sa-btn sa-btn-ghost !py-1.5 text-xs"
                    >
                      {t("warnings.dismiss")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Received warnings — hidden for the top level (can't be warned) and
          when there are none, to avoid an empty block. */}
      {level < 5 && received.length > 0 && (
      <div className="mb-6">
        <p className="sa-eyebrow mb-3">{t("warnings.received")}</p>
        {(
          <div className="space-y-2">
            {received.map((w) => (
              <div
                key={w.id}
                className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-[var(--sa-text)]">
                    {w.reason}
                    <span className="mt-1 block text-xs text-[var(--sa-text-quaternary)]">
                      {w.from}
                    </span>
                  </p>
                  {w.revoked ? (
                    <span className="shrink-0 text-xs text-[var(--sa-ok)]">
                      {t("warnings.revoked")}
                    </span>
                  ) : w.hasComplaint ? (
                    <span className="shrink-0 text-xs text-[var(--sa-text-quaternary)]">
                      {t("warnings.appealed")}
                    </span>
                  ) : latestAppealable?.id === w.id ? (
                    <button
                      type="button"
                      onClick={() => setAppealFor(w.id)}
                      className="shrink-0 text-xs text-[var(--sa-text-quaternary)] transition-colors hover:text-[var(--sa-text-secondary)]"
                    >
                      {t("warnings.appeal")}
                    </button>
                  ) : null}
                </div>
                {appealFor === w.id && (
                  <div className="sa-reveal mt-3 space-y-2">
                    <textarea
                      className="sa-textarea w-full text-sm"
                      rows={2}
                      value={appealReason}
                      onChange={(e) => setAppealReason(e.target.value)}
                      placeholder={t("warnings.appealReason")}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => submitAppeal(w.id)}
                      className="sa-btn sa-btn-primary !py-1.5 text-xs"
                    >
                      {t("warnings.submitAppeal")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Issued (level >= 3) */}
      {level >= 3 && issued.length > 0 && (
        <div>
          <p className="sa-eyebrow mb-3">{t("warnings.issued")}</p>
          <div className="space-y-2">
            {issued.map((w) => (
              <div
                key={w.id}
                className="flex items-start justify-between gap-3 rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3"
              >
                <p className="text-sm text-[var(--sa-text-secondary)]">
                  {w.reason}
                  <span className="mt-1 block text-xs text-[var(--sa-text-quaternary)]">
                    {w.to}
                  </span>
                </p>
                {w.revoked && (
                  <span className="shrink-0 text-xs text-[var(--sa-ok)]">
                    {t("warnings.revoked")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingResolve && (
        <ConfirmDialog
          danger={pendingResolve.action === "dismiss"}
          title={t(
            pendingResolve.action === "uphold"
              ? "warnings.confirmUphold"
              : "warnings.confirmDismiss"
          )}
          description=""
          confirmLabel={t(
            pendingResolve.action === "uphold"
              ? "warnings.uphold"
              : "warnings.dismiss"
          )}
          showReason={pendingResolve.action === "dismiss"}
          reasonValue={dismissReason}
          reasonPrompt={t("confirm.rejectReasonPrompt")}
          onReasonChange={setDismissReason}
          onCancel={() => {
            setPendingResolve(null);
            setDismissReason("");
          }}
          onConfirm={() => {
            const p = pendingResolve;
            setPendingResolve(null);
            resolve(p.id, p.action, dismissReason);
            setDismissReason("");
          }}
        />
      )}
    </section>
  );
}
