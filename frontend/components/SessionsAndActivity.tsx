"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import ConfirmDialog from "@/components/ConfirmDialog";

type Session = {
  id: string;
  // All underlying session ids for this device (same IP is grouped into one
  // entry). Revoking the device signs out all of them at once.
  ids?: string[];
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

type EventItem = {
  id: string;
  type: string;
  ip: string | null;
  createdAt: string;
};

/* Active sessions (with remote sign-out) + a recent security activity log. */
export default function SessionsAndActivity() {
  const t = useT();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  // "now" captured in state (not Date.now() in render — that is an impure call
  // during render). Refreshed on a light interval so the active/inactive dot
  // stays roughly current without re-reading the clock while rendering.
  const [now, setNow] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const [sRes, eRes] = await Promise.all([
      fetch("/api/auth/sessions"),
      fetch("/api/auth/events"),
    ]);
    if (sRes.ok) setSessions((await sRes.json()).sessions ?? []);
    if (eRes.ok) setEvents((await eRes.json()).events ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(s: Session) {
    setBusy(true);
    // Revoke every login from this device (all session ids sharing its IP),
    // falling back to the single id when the grouping is unavailable.
    const ids = s.ids && s.ids.length > 0 ? s.ids : [s.id];
    await fetch("/api/auth/sessions/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await load();
    setBusy(false);
  }

  async function revokeAll() {
    setBusy(true);
    await fetch("/api/auth/sessions/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    await load();
    setBusy(false);
  }

  const deviceLabel = (ua: string | null) => {
    if (!ua) return t("auth.sessionUnknownDevice");
    // Short, human-ish label from the user-agent.
    const m =
      ua.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/) ||
      ua.match(/(Firefox|Edge|Chrome|Safari)/);
    const browser = m ? m[0].replace("Edg", "Edge") : ua.slice(0, 40);
    const os =
      /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Android/.test(ua)
            ? "Android"
            : /iPhone|iPad|iOS/.test(ua)
              ? "iOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
    return os ? `${browser} · ${os}` : browser;
  };

  const eventLabel = (type: string) => {
    const key = `auth.ev_${type}`;
    const translated = t(key as any);
    // If a key is missing, fall back to the raw type.
    return translated === key ? type : translated;
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString();

  /* Partially hide the IP for privacy: keep the first two octets (IPv4) or the
     first group (IPv6), mask the rest. e.g. 203.0.113.42 → 203.0.•.•  */
  const maskIp = (ip: string | null): string => {
    if (!ip) return "";
    if (ip.includes(":")) {
      const g = ip.split(":");
      return `${g[0]}:${g[1] ?? ""}:•:•`;
    }
    const p = ip.split(".");
    if (p.length === 4) return `${p[0]}.${p[1]}.•.•`;
    return "•";
  };

  /* A session is "active" if it is the current one or was seen within the last
     15 minutes; otherwise it is shown as inactive (grey dot). */
  const isActive = (s: Session): boolean => {
    if (s.current) return true;
    if (!now) return false; // before the first clock tick, treat as inactive
    return now - new Date(s.lastSeenAt).getTime() < 15 * 60 * 1000;
  };

  const others = sessions.filter((s) => !s.current).length;

  return (
    <>
      {/* Active sessions */}
      <section className="sa-card mt-4 p-6 md:p-7">
        <p className="sa-eyebrow mb-2">{t("auth.sessionsTitle")}</p>
        <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
          {t("auth.sessionsLead")}
        </p>

        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                {/* Active (green) / inactive (grey) indicator. */}
                <span
                  aria-hidden
                  title={isActive(s) ? t("auth.sessionActive") : t("auth.sessionInactive")}
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: isActive(s)
                      ? "var(--sa-ok, #4ea36b)"
                      : "var(--sa-text-quaternary)",
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-[var(--sa-text)]">
                    {deviceLabel(s.userAgent)}
                    {s.current && (
                      <span className="ml-2 text-xs text-[var(--sa-text-quaternary)]">
                        · {t("auth.sessionCurrent")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--sa-text-quaternary)]">
                    <span className="sa-mono">{maskIp(s.ip)}</span>
                    {s.ip ? " · " : ""}
                    {isActive(s) ? t("auth.sessionActive") : t("auth.sessionInactive")}
                    {" · "}
                    {fmt(s.lastSeenAt)}
                  </p>
                </div>
              </div>
              {!s.current && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => revoke(s)}
                  className="shrink-0 rounded-full border border-[var(--sa-line)] px-3 py-1 text-xs text-[var(--sa-text-tertiary)] transition-colors hover:border-[var(--sa-danger)]/60 hover:text-[var(--sa-danger)] disabled:opacity-40"
                >
                  {t("auth.sessionRevoke")}
                </button>
              )}
            </div>
          ))}
        </div>

        {others > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmAll(true)}
            className="sa-btn sa-btn-ghost mt-4"
          >
            {t("auth.sessionsRevokeAll")}
          </button>
        )}

        {confirmAll && (
          <ConfirmDialog
            danger
            title={t("auth.sessionsRevokeAllConfirmTitle")}
            description={t("auth.sessionsRevokeAllConfirmDesc")}
            confirmLabel={t("auth.sessionsRevokeAll")}
            onCancel={() => setConfirmAll(false)}
            onConfirm={() => {
              setConfirmAll(false);
              revokeAll();
            }}
          />
        )}
      </section>

      {/* Security activity log */}
      <section className="sa-card mt-4 p-6 md:p-7">
        <p className="sa-eyebrow mb-4">{t("auth.activityTitle")}</p>
        {events.length === 0 ? (
          <p className="text-sm text-[var(--sa-text-tertiary)]">
            {t("auth.activityEmpty")}
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between border-b border-[var(--sa-line)] pb-2 text-sm last:border-0"
              >
                <span className="text-[var(--sa-text-secondary)]">
                  {eventLabel(e.type)}
                </span>
                <span className="text-xs text-[var(--sa-text-quaternary)]">
                  {e.ip ? `${e.ip} · ` : ""}
                  {fmt(e.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
