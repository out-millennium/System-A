"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useQueueFilter } from "@/lib/useQueueFilter";

type Req = {
  id: string;
  reason: string;
  by: string | null;
  level: number | null;
  createdAt: string;
};

/* Review admin account-deletion requests (level 4 handles <4; creator handles
   level-4 requests). Approving deletes the account. */
export default function DeletionRequestsReview() {
  const t = useT();
  const { toast } = useToast();
  const [reqs, setReqs] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    action: "approve" | "reject";
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/deletion-requests");
    if (res.ok) setReqs((await res.json()).requests ?? []);
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
      const res = await fetch("/api/admin/deletion-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
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
    reqs,
    (r) => `${r.by ?? ""} ${r.reason}`
  );

  if (reqs.length === 0) {
    return (
      <section className="sa-card mt-4 p-6 md:p-7">
        <p className="sa-eyebrow mb-4">{t("deletionReq.title")}</p>
        <p className="text-sm text-[var(--sa-text-tertiary)]">
          {t("deletionReq.none")}
        </p>
      </section>
    );
  }

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-4">{t("deletionReq.title")}</p>
      <div className="space-y-3">
        <input
          className="sa-input text-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("queue.search")}
        />
        {visible.map((r) => (
          <div
            key={r.id}
            className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-4"
          >
            <p className="text-xs text-[var(--sa-text-quaternary)]">
              {t("deletionReq.by")}:{" "}
              <span className="sa-mono text-[var(--sa-text-tertiary)]">
                {r.by}
              </span>{" "}
              · admin · {r.level}
            </p>
            <p className="mt-1 text-sm text-[var(--sa-text)]">{r.reason}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending({ id: r.id, action: "approve" })}
                className="sa-btn sa-btn-primary !bg-[var(--sa-danger)] !py-1.5 text-xs"
              >
                {t("deletionReq.approve")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending({ id: r.id, action: "reject" })}
                className="sa-btn sa-btn-ghost !py-1.5 text-xs"
              >
                {t("deletionReq.reject")}
              </button>
            </div>
          </div>
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={showMore}
            className="sa-btn sa-btn-ghost w-full !py-1.5 text-xs"
          >
            {t("queue.showMore")}
          </button>
        )}
      </div>

      {pending && (
        <ConfirmDialog
          danger={pending.action === "approve"}
          title={t(
            pending.action === "approve"
              ? "deletionReq.confirmApprove"
              : "deletionReq.confirmReject"
          )}
          description=""
          confirmLabel={t(
            pending.action === "approve"
              ? "deletionReq.approve"
              : "deletionReq.reject"
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
