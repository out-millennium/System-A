"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useQueueFilter } from "@/lib/useQueueFilter";

type Appeal = {
  id: string;
  reason: string;
  by: string | null;
  kind: string;
  punishmentReason: string | null;
  actor: string | null;
  createdAt: string;
};

/* Review users' appeals against ban/mute. Visible to admins strictly above the
   punishing admin's level (a level-4 punishment is reviewed by the creator). */
export default function ModerationAppealsReview() {
  const t = useT();
  const { toast } = useToast();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    action: "uphold" | "dismiss";
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/moderation-appeals");
    if (res.ok) setAppeals((await res.json()).appeals ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(
    id: string,
    action: "uphold" | "dismiss",
    reviewNote?: string
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/moderation-appeals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          reviewNote: action === "dismiss" ? reviewNote : undefined,
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
    appeals,
    (a) => `${a.by ?? ""} ${a.reason} ${a.punishmentReason ?? ""} ${a.actor ?? ""}`
  );

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-4">{t("modappeal.title")}</p>
      {appeals.length === 0 ? (
        <p className="text-sm text-[var(--sa-text-tertiary)]">
          {t("modappeal.none")}
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
                {t("modappeal.by")}:{" "}
                <span className="sa-mono text-[var(--sa-text-tertiary)]">
                  {a.by}
                </span>{" "}
                · {a.kind} · {t("modappeal.punishment")}: “
                {a.punishmentReason ?? "—"}” ({a.actor})
              </p>
              <p className="mt-1 text-sm text-[var(--sa-text)]">{a.reason}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPending({ id: a.id, action: "uphold" })}
                  className="sa-btn sa-btn-primary !py-1.5 text-xs"
                >
                  {t("modappeal.uphold")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPending({ id: a.id, action: "dismiss" })}
                  className="sa-btn sa-btn-ghost !py-1.5 text-xs text-[var(--sa-danger)]"
                >
                  {t("modappeal.dismiss")}
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
      )}

      {pending && (
        <ConfirmDialog
          danger={pending.action === "dismiss"}
          title={t(
            pending.action === "uphold"
              ? "modappeal.confirmUphold"
              : "modappeal.confirmDismiss"
          )}
          description=""
          confirmLabel={t(
            pending.action === "uphold" ? "modappeal.uphold" : "modappeal.dismiss"
          )}
          showReason={pending.action === "dismiss"}
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
