"use client";

import { useModeration } from "@/lib/useModeration";
import { useT } from "@/lib/i18n";

/* Wraps an action a muted/banned user may not perform. When restricted, dims
   the children, blocks interaction, and marks "Unavailable" with a forbidden
   cursor on hover. */
export default function MuteDisabled({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useModeration();
  const t = useT();
  const restricted = Boolean(status?.muted.active || status?.banned.active);
  if (!restricted) return <>{children}</>;

  return (
    <div className="relative">
      <div className="sa-unavailable" aria-disabled="true">
        {children}
      </div>
      <span className="absolute right-6 top-6 z-10 rounded-full border border-[var(--sa-line)] bg-[var(--sa-surface-1)] px-3 py-1 text-xs text-[var(--sa-text-tertiary)]">
        {t("moderation.unavailable")}
      </span>
    </div>
  );
}
