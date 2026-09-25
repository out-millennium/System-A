"use client";

import { useEffect, useRef, useState } from "react";
import { useT, useI18n } from "@/lib/i18n";
import { formatRemaining } from "@/lib/duration";
import type { ModerationStatus } from "@/lib/moderation";

export type PreviewData = {
  found: boolean;
  accountName?: string | null;
  isSelf?: boolean;
  isAdmin?: boolean;
  adminLevel?: number | null;
  status?: ModerationStatus;
  activeWarnings?: number | null;
  nextIsThird?: boolean;
  canModerate?: boolean;
};

/* A debounced live "who is this?" card shown under name/email input fields
   after sign-in. Regular users only ever see existence + display name; admins
   also see role/level and live ban/mute status (the API enforces this).

   Pass `onData` to lift the resolved preview to the parent (e.g. to reveal the
   mute-hours field only when the next warning would be the third). */
export default function AccountPreview({
  identifier,
  onData,
  refreshKey,
}: {
  identifier: string;
  onData?: (d: PreviewData | null) => void;
  // Bump this to force a re-fetch of the same identifier (e.g. after an action
  // that changed the target's status).
  refreshKey?: number;
}) {
  const t = useT();
  const { locale } = useI18n();
  const [data, setData] = useState<PreviewData | null>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    const id = identifier.trim();
    if (!id) {
      setData(null);
      onDataRef.current?.(null);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/account-preview?identifier=${encodeURIComponent(id)}`,
          { cache: "no-store" }
        );
        if (!active) return;
        const d: PreviewData = res.ok ? await res.json() : { found: false };
        setData(d);
        onDataRef.current?.(d);
      } catch {
        if (active) {
          setData(null);
          onDataRef.current?.(null);
        }
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [identifier, refreshKey]);

  if (!identifier.trim() || !data) return null;

  const statusLine = (): string | null => {
    if (!data.status) return null;
    const s = data.status;
    if (s.banned.active)
      return `${t("preview.banned")}${
        s.banned.permanent
          ? ` (${t("preview.permanent")})`
          : s.banned.until
            ? ` · ${formatRemaining(s.banned.until, locale)}`
            : ""
      }`;
    if (s.muted.active)
      return `${t("preview.muted")}${
        s.muted.permanent
          ? ` (${t("preview.permanent")})`
          : s.muted.until
            ? ` · ${formatRemaining(s.muted.until, locale)}`
            : ""
      }`;
    return t("preview.clear");
  };

  return (
    <div className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3 text-xs">
      {!data.found ? (
        <span className="text-[var(--sa-danger)]">{t("preview.notFound")}</span>
      ) : (
        <div className="space-y-1">
          <p className="text-[var(--sa-text)]">
            <span className="sa-mono">{data.accountName}</span>
            {data.isSelf && (
              <span className="ml-2 text-[var(--sa-text-quaternary)]">
                {t("preview.you")}
              </span>
            )}
            {data.isAdmin && data.adminLevel != null && (
              <span className="ml-2 text-[var(--sa-danger)]">
                admin · {data.adminLevel}
              </span>
            )}
          </p>
          {statusLine() && (
            <p className="text-[var(--sa-text-tertiary)]">{statusLine()}</p>
          )}
          {data.status && data.canModerate === false && (
            <p className="text-[var(--sa-danger)]">
              {t("preview.cannotTarget")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
