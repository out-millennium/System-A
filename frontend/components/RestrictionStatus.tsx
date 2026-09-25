"use client";

import { useModeration } from "@/lib/useModeration";
import { useT, useI18n } from "@/lib/i18n";
import { formatRemaining } from "@/lib/duration";
import AppealForm from "@/components/AppealForm";

/* Shows the current account's active restriction (mute/ban) with remaining time,
   for the profile page. Renders nothing when unrestricted. */
export default function RestrictionStatus() {
  const { status } = useModeration();
  const t = useT();
  const { locale } = useI18n();
  if (!status) return null;

  const r = status.banned.active
    ? { kind: "ban" as const, ...status.banned }
    : status.muted.active
      ? { kind: "mute" as const, ...status.muted }
      : null;
  if (!r) return null;

  const label =
    r.kind === "ban" ? t("restrictionStatus.banned") : t("restrictionStatus.muted");
  const timeText = r.permanent
    ? t("restrictionStatus.permanent")
    : r.until
      ? t("restrictionStatus.remaining").replace(
          "{time}",
          formatRemaining(r.until, locale)
        )
      : "";

  return (
    <section className="sa-card mt-4 border-[var(--sa-danger)]/30 p-6 md:p-7">
      <p className="sa-eyebrow mb-2 text-[var(--sa-danger)]">{label}</p>
      <p className="text-sm text-[var(--sa-text-secondary)]">
        {r.reason ? `${t("restrictionStatus.reason")}: ${r.reason}` : ""}
      </p>
      {timeText && (
        <p className="mt-1 text-xs text-[var(--sa-text-tertiary)]">{timeText}</p>
      )}

      {/* One-time appeal against this restriction. */}
      <AppealForm />
    </section>
  );
}
