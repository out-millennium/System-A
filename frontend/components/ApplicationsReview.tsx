"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { useQueueFilter } from "@/lib/useQueueFilter";
import ConfirmDialog from "@/components/ConfirmDialog";
import Select from "@/components/Select";

type App = {
  id: string;
  reason: string;
  requestedLevel: number;
  applicant: string | null;
  createdAt: string;
};

/* Review admin applications (level >= 4). Level 4 may grant 1..3; the creator
   (level 5) may grant 1..4. */
export default function ApplicationsReview({
  reviewerLevel,
}: {
  reviewerLevel: number;
}) {
  const t = useT();
  const { toast } = useToast();
  const [apps, setApps] = useState<App[]>([]);
  const [grant, setGrant] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    action: "approve" | "reject";
  } | null>(null);
  // Optional rejection reason captured in the confirm dialog.
  const [rejectReason, setRejectReason] = useState("");
  const maxGrant = reviewerLevel >= 5 ? 4 : 3;

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/applications");
    if (res.ok) setApps((await res.json()).applications ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(
    id: string,
    action: "approve" | "reject",
    reviewNote?: string
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          level: Number(grant[id] ?? "1"),
          reviewNote: action === "reject" ? reviewNote : undefined,
        }),
      });
      if (!res.ok) {
        toast(t("profile.failed"), "error", { sound: "error" });
        return;
      }
      await load();
      toast(t("notif.resolved"), "success", { sound: "important" });
    } catch {
      toast(t("profile.failed"), "error", { sound: "error" });
    } finally {
      setBusy(false);
    }
  }

  const { query, setQuery, visible, hasMore, showMore } = useQueueFilter(
    apps,
    (a) => `${a.applicant ?? ""} ${a.reason}`
  );

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-4">{t("apply.reviewTitle")}</p>
      {apps.length === 0 ? (
        <p className="text-sm text-[var(--sa-text-tertiary)]">
          {t("apply.noApps")}
        </p>
      ) : (
        <div className="space-y-3">
          <input
            className="sa-input text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("queue.search")}
          />
          {visible.map((a) => (
            <div
              key={a.id}
              className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-4"
            >
              <p className="text-xs text-[var(--sa-text-quaternary)]">
                {t("apply.applicant")}:{" "}
                <span className="sa-mono text-[var(--sa-text-tertiary)]">
                  {a.applicant}
                </span>{" "}
                · {t("apply.requested")}: {a.requestedLevel}
              </p>
              <p className="mt-1 text-sm text-[var(--sa-text)]">{a.reason}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-xs text-[var(--sa-text-quaternary)]">
                  {t("apply.grantLevel")}
                </label>
                <Select
                  className="w-auto min-w-[5rem]"
                  buttonClassName="!py-1.5 text-xs"
                  ariaLabel={t("apply.grantLevel")}
                  value={grant[a.id] ?? "1"}
                  onChange={(v) => setGrant((g) => ({ ...g, [a.id]: v }))}
                  options={Array.from({ length: maxGrant }, (_, i) => i + 1).map(
                    (n) => ({ value: String(n), label: String(n) })
                  )}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPending({ id: a.id, action: "approve" })}
                  className="sa-btn sa-btn-primary !py-1.5 text-xs"
                >
                  {t("apply.approve")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPending({ id: a.id, action: "reject" })}
                  className="sa-btn sa-btn-ghost !py-1.5 text-xs text-[var(--sa-danger)]"
                >
                  {t("apply.reject")}
                </button>
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={showMore}
              className="sa-btn sa-btn-ghost !py-1.5 text-xs"
            >
              {t("queue.showMore")}
            </button>
          )}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          danger={pending.action === "reject"}
          title={t(
            pending.action === "approve"
              ? "apply.confirmApprove"
              : "apply.confirmReject"
          )}
          description=""
          confirmLabel={t(
            pending.action === "approve" ? "apply.approve" : "apply.reject"
          )}
          showReason={pending.action === "reject"}
          reasonValue={rejectReason}
          reasonPrompt={t("confirm.rejectReasonPrompt")}
          onReasonChange={setRejectReason}
          onCancel={() => {
            setPending(null);
            setRejectReason("");
          }}
          onConfirm={() => {
            const p = pending;
            setPending(null);
            resolve(p.id, p.action, rejectReason);
            setRejectReason("");
          }}
        />
      )}
    </section>
  );
}
