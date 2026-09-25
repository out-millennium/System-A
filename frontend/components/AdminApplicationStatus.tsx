"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import ConfirmDialog from "@/components/ConfirmDialog";

type Application = {
  status: string; // open | approved | rejected | withdrawn
  requestedLevel: number;
  reviewNote: string | null;
  createdAt: string;
};

/* Profile card: the CALLER's own admin-application status.
   • Shows the latest application's status (under review / approved / rejected /
     withdrawn) and, when rejected, the reviewer's reason.
   • While the application is still open, the applicant can withdraw it.
   • For admins who can review (level >= 4), shows a shortcut to the review
     screen instead ("рассмотреть заявки").
   Renders nothing when there is no application and the viewer is not a
   reviewer. */
export default function AdminApplicationStatus() {
  const t = useT();
  const { toast } = useToast();
  const [app, setApp] = useState<Application | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLevel, setAdminLevel] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/apply-admin");
      if (res.ok) {
        const d = await res.json();
        setApp(d.application ?? null);
        setIsAdmin(!!d.isAdmin);
        setAdminLevel(d.adminLevel ?? null);
      }
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function withdraw() {
    setBusy(true);
    const res = await fetch("/api/apply-admin", { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      toast(t("apply.withdrawn"), "success");
      await load();
    } else {
      toast(t("apply.withdrawFailed"), "error");
    }
  }

  if (!loaded) return null;

  const canReview = isAdmin && (adminLevel ?? 0) >= 4;

  // Nothing to show: not an applicant and not a reviewer.
  if (!app && !canReview) return null;

  const statusLabel = (s: string) =>
    ({
      open: t("apply.statusOpen"),
      approved: t("apply.statusApproved"),
      rejected: t("apply.statusRejected"),
      withdrawn: t("apply.statusWithdrawn"),
    } as Record<string, string>)[s] ?? s;

  const statusColor = (s: string) =>
    s === "approved"
      ? "text-[var(--sa-ok)]"
      : s === "rejected"
        ? "text-[var(--sa-danger)]"
        : s === "open"
          ? "text-[var(--sa-text-secondary)]"
          : "text-[var(--sa-text-quaternary)]";

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-4">{t("apply.statusTitle")}</p>

      {app ? (
        <div className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-[var(--sa-text)]">
              {t("apply.requested")}: {app.requestedLevel}
            </p>
            <span className={`shrink-0 text-xs ${statusColor(app.status)}`}>
              {statusLabel(app.status)}
            </span>
          </div>
          {app.status === "rejected" && app.reviewNote && (
            <p className="mt-2 whitespace-pre-line text-xs text-[var(--sa-text-tertiary)]">
              {t("apply.rejectionReason")}: {app.reviewNote}
            </p>
          )}
          <p className="mt-1 text-[0.6875rem] text-[var(--sa-text-quaternary)]">
            {new Date(app.createdAt).toLocaleString()}
          </p>
          {app.status === "open" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmWithdraw(true)}
              className="mt-3 text-xs text-[var(--sa-text-quaternary)] transition-colors hover:text-[var(--sa-danger)] disabled:opacity-40"
            >
              {t("apply.withdraw")}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-[var(--sa-text-tertiary)]">
          {t("apply.noApplication")}
        </p>
      )}

      {canReview && (
        <Link
          href="/dashboard/admin/reviews"
          className="sa-navlink mt-4 inline-flex items-center gap-1 text-xs"
        >
          {t("apply.goReview")} →
        </Link>
      )}

      {confirmWithdraw && (
        <ConfirmDialog
          danger
          title={t("apply.withdrawConfirm")}
          description=""
          confirmLabel={t("apply.withdraw")}
          onCancel={() => setConfirmWithdraw(false)}
          onConfirm={() => {
            setConfirmWithdraw(false);
            withdraw();
          }}
        />
      )}
    </section>
  );
}
