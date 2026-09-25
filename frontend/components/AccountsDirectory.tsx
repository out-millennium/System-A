"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

/* Accounts directory (admin level >= 4).
   A searchable, incrementally-loaded table of accounts the admin may see
   (strictly lower levels). Search by name/email/linked-Google-email, by session
   IP (as a "number", e.g. 203.0.113), by resolved region (GeoIP), and filter by
   admin level via checkboxes. "Load more" appends the next page. */

type Account = {
  id: string;
  accountName: string | null;
  email: string | null;
  level: number;
  canModerate: boolean;
  linkedEmails: string[];
  providers: string[];
  createdAt: string;
  hasKey: boolean;
  banned: boolean;
  muted: boolean;
  lastIp: string | null;
  lastSeenAt: string | null;
};

export default function AccountsDirectory({ viewerLevel }: { viewerLevel: number }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [ip, setIp] = useState("");
  const [region, setRegion] = useState("");
  // Levels the viewer may see: 0 (users) .. viewerLevel-1.
  const visibleLevels = Array.from({ length: viewerLevel }, (_, i) => i); // 0..viewerLevel-1
  const [levels, setLevels] = useState<number[]>(visibleLevels);

  const [rows, setRows] = useState<Account[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  // Inline per-row actions. These are a convenience wrapper over the existing
  // moderation endpoints — no new backend logic. The expanded row is a mini
  // form (reason / hours), and revokeKey (creator only) confirms with the
  // creator's own password. We track only ONE open row at a time.
  const isCreator = viewerLevel >= 5;
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("");
  const [revokePwd, setRevokePwd] = useState("");
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState("");
  const [rowMsg, setRowMsg] = useState("");

  const fetchPage = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (ip.trim()) params.set("ip", ip.trim());
        if (region.trim()) params.set("region", region.trim());
        if (levels.length > 0) params.set("levels", levels.join(","));
        if (!reset && cursor) params.set("cursor", cursor);
        const r = await fetch(`/api/admin/accounts?${params.toString()}`, {
          cache: "no-store",
        });
        const d = await r.json();
        if (!r.ok) {
          setError(t("accounts.failed"));
          setLoading(false);
          return;
        }
        setRows((prev) => (reset ? d.accounts : [...prev, ...d.accounts]));
        setCursor(d.nextCursor ?? null);
        setHasMore(Boolean(d.nextCursor));
        setLoaded(true);
      } catch {
        setError(t("accounts.failed"));
      }
      setLoading(false);
    },
    [q, ip, region, levels, cursor, t]
  );

  // Initial load. fetchPage is async (setState after await), so this is safe.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPage(true);
  }, []);

  function toggleLevel(l: number) {
    setLevels((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l].sort()
    );
  }

  function applySearch() {
    setCursor(null);
    fetchPage(true);
  }

  // Open/close the inline action drawer for a row, resetting its inputs.
  function toggleActions(a: Account) {
    setRowError("");
    setRowMsg("");
    if (openId === a.id) {
      setOpenId(null);
      return;
    }
    setOpenId(a.id);
    setReason("");
    setHours("");
    setRevokePwd("");
  }

  // Update just one row locally after a status change (avoids a full reload).
  function patchRow(id: string, patch: Partial<Account>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // Ban / mute / unban / unmute via the existing /api/admin/moderation route.
  // The account identifier sent is the accountName (falls back to email).
  async function runModeration(
    a: Account,
    action: "ban" | "mute" | "unban" | "unmute"
  ) {
    const identifier = a.accountName || a.email;
    if (!identifier) return;
    setRowError("");
    setRowMsg("");
    if ((action === "ban" || action === "mute") && !reason.trim()) {
      setRowError(t("accounts.reasonRequired"));
      return;
    }
    setRowBusy(true);
    try {
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
      if (res.ok) {
        setRowMsg(t(`accounts.done_${action}`));
        // Reflect the new status in the row immediately.
        if (action === "ban") patchRow(a.id, { banned: true });
        else if (action === "unban") patchRow(a.id, { banned: false });
        else if (action === "mute") patchRow(a.id, { muted: true });
        else if (action === "unmute") patchRow(a.id, { muted: false });
        setReason("");
        setHours("");
      } else {
        setRowError(
          d.error === "not_lower"
            ? t("accounts.errNotLower")
            : d.error === "cannot_self"
              ? t("accounts.errSelf")
              : d.error === "user_not_found"
                ? t("accounts.errNotFound")
                : d.error === "reason_required"
                  ? t("accounts.reasonRequired")
                  : t("accounts.actionFailed")
        );
      }
    } catch {
      setRowError(t("accounts.actionFailed"));
    }
    setRowBusy(false);
  }

  // Revoke the target's Core API key (creator/level 5 only) via the existing
  // /api/admin/creator route. Confirmed with the creator's OWN password.
  async function runRevokeKey(a: Account) {
    const identifier = a.accountName || a.email;
    if (!identifier) return;
    setRowError("");
    setRowMsg("");
    if (!revokePwd) {
      setRowError(t("accounts.pwdRequired"));
      return;
    }
    setRowBusy(true);
    try {
      const res = await fetch("/api/admin/creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier,
          action: "revokeKey",
          password: revokePwd,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setRowMsg(t("accounts.done_revokeKey"));
        patchRow(a.id, { hasKey: false });
        setRevokePwd("");
      } else {
        setRowError(
          d.error === "invalid_password"
            ? t("accounts.errPassword")
            : d.error === "no_key"
              ? t("accounts.errNoKey")
              : d.error === "cannot_creator"
                ? t("accounts.errNotLower")
                : t("accounts.actionFailed")
        );
      }
    } catch {
      setRowError(t("accounts.actionFailed"));
    }
    setRowBusy(false);
  }

  const levelName = (l: number) =>
    l === 0 ? t("accounts.levelUser") : `${t("accounts.levelAdmin")} ${l}`;

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-2">{t("accounts.title")}</p>
      <p className="sa-lead mb-5 text-xs">{t("accounts.lead")}</p>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          className="sa-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("accounts.searchPrompt")}
          onKeyDown={(e) => e.key === "Enter" && applySearch()}
        />
        <input
          className="sa-input sa-mono"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder={t("accounts.ipPrompt")}
          onKeyDown={(e) => e.key === "Enter" && applySearch()}
        />
        <input
          className="sa-input"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder={t("accounts.regionPrompt")}
          onKeyDown={(e) => e.key === "Enter" && applySearch()}
        />
      </div>

      {/* Level checkboxes */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-xs text-[var(--sa-text-quaternary)]">
          {t("accounts.levelsLabel")}
        </span>
        {visibleLevels.map((l) => (
          <label key={l} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              className="sa-checkbox"
              checked={levels.includes(l)}
              onChange={() => toggleLevel(l)}
            />
            {levelName(l)}
          </label>
        ))}
        <button
          type="button"
          onClick={applySearch}
          disabled={loading}
          className="sa-btn sa-btn-primary !py-1.5 !px-4 text-xs"
        >
          {t("accounts.search")}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-[var(--sa-danger)]">{error}</p>}

      {/* Table */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.6875rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
              <th className="py-2 pr-3">{t("accounts.colAccount")}</th>
              <th className="py-2 pr-3">{t("accounts.colEmail")}</th>
              <th className="py-2 pr-3">{t("accounts.colLevel")}</th>
              <th className="py-2 pr-3">{t("accounts.colStatus")}</th>
              <th className="py-2 pr-3">{t("accounts.colLastIp")}</th>
              <th className="py-2 pr-3 text-right">{t("accounts.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const isOpen = openId === a.id;
              return (
                <Fragment key={a.id}>
                  <tr className="border-t border-[var(--sa-line-faint)]">
                    <td className="sa-mono py-2 pr-3 text-[var(--sa-text)]">
                      {a.accountName || "—"}
                    </td>
                    <td className="py-2 pr-3 text-[var(--sa-text-secondary)]">
                      <div>{a.email || "—"}</div>
                      {a.linkedEmails
                        .filter((e) => e !== a.email)
                        .map((e) => (
                          <div
                            key={e}
                            className="text-xs text-[var(--sa-text-quaternary)]"
                          >
                            {e}
                          </div>
                        ))}
                    </td>
                    <td className="py-2 pr-3">{levelName(a.level)}</td>
                    <td className="py-2 pr-3 text-xs">
                      {a.banned ? (
                        <span className="text-[var(--sa-danger)]">
                          {t("accounts.statusBanned")}
                        </span>
                      ) : a.muted ? (
                        <span className="text-[var(--sa-accent)]">
                          {t("accounts.statusMuted")}
                        </span>
                      ) : (
                        <span className="text-[var(--sa-text-tertiary)]">
                          {t("accounts.statusActive")}
                        </span>
                      )}
                    </td>
                    <td className="sa-mono py-2 pr-3 text-xs text-[var(--sa-text-tertiary)]">
                      {a.lastIp || "—"}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {a.canModerate ? (
                        <button
                          type="button"
                          onClick={() => toggleActions(a)}
                          className="sa-btn sa-btn-ghost !py-1 !px-3 text-xs"
                          aria-expanded={isOpen}
                        >
                          {isOpen
                            ? t("accounts.actionsClose")
                            : t("accounts.actions")}
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--sa-text-quaternary)]">
                          —
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Inline action drawer — a mini moderation form. Reuses the
                      existing /api/admin/moderation and /api/admin/creator
                      endpoints; no new backend authority. */}
                  {isOpen && (
                    <tr className="border-t border-[var(--sa-line-faint)] bg-[var(--sa-surface-0)]">
                      <td colSpan={6} className="p-4">
                        <div className="sa-reveal space-y-3">
                          <p className="sa-eyebrow">
                            {t("accounts.actionsFor").replace(
                              "{id}",
                              a.accountName || a.email || ""
                            )}
                          </p>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <input
                              className="sa-input"
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder={t("accounts.reasonPrompt")}
                            />
                            <input
                              className="sa-input"
                              type="number"
                              min={0}
                              value={hours}
                              onChange={(e) => setHours(e.target.value)}
                              placeholder={t("accounts.hoursPrompt")}
                            />
                          </div>

                          {rowError && (
                            <p className="text-sm text-[var(--sa-danger)]">
                              {rowError}
                            </p>
                          )}
                          {rowMsg && (
                            <p className="text-sm text-[var(--sa-ok)]">{rowMsg}</p>
                          )}

                          {/* Apply restrictions (reason required). */}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={rowBusy || a.banned}
                              onClick={() => runModeration(a, "ban")}
                              className="sa-btn sa-btn-primary !bg-[var(--sa-danger)] !py-1.5 !px-4 text-xs disabled:opacity-40"
                            >
                              {t("accounts.ban")}
                            </button>
                            <button
                              type="button"
                              disabled={rowBusy || a.muted}
                              onClick={() => runModeration(a, "mute")}
                              className="sa-btn sa-btn-ghost !py-1.5 !px-4 text-xs disabled:opacity-40"
                            >
                              {t("accounts.mute")}
                            </button>
                            <button
                              type="button"
                              disabled={rowBusy || !a.banned}
                              onClick={() => runModeration(a, "unban")}
                              className="sa-btn sa-btn-ghost !py-1.5 !px-4 text-xs disabled:opacity-40"
                            >
                              {t("accounts.unban")}
                            </button>
                            <button
                              type="button"
                              disabled={rowBusy || !a.muted}
                              onClick={() => runModeration(a, "unmute")}
                              className="sa-btn sa-btn-ghost !py-1.5 !px-4 text-xs disabled:opacity-40"
                            >
                              {t("accounts.unmute")}
                            </button>
                          </div>

                          {/* Revoke API key — creator (level 5) only, confirmed
                              with the creator's own password. */}
                          {isCreator && a.hasKey && (
                            <div className="mt-1 border-t border-[var(--sa-line-faint)] pt-3">
                              <p className="mb-2 text-xs text-[var(--sa-text-tertiary)]">
                                {t("accounts.revokeKeyHint")}
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  className="sa-input max-w-xs"
                                  type="password"
                                  value={revokePwd}
                                  onChange={(e) => setRevokePwd(e.target.value)}
                                  placeholder={t("accounts.yourPassword")}
                                />
                                <button
                                  type="button"
                                  disabled={rowBusy}
                                  onClick={() => runRevokeKey(a)}
                                  className="sa-btn sa-btn-ghost !py-1.5 !px-4 text-xs disabled:opacity-40"
                                >
                                  {t("accounts.revokeKey")}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {loaded && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-[var(--sa-text-quaternary)]">
                  {t("accounts.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => fetchPage(false)}
            disabled={loading}
            className="sa-btn sa-btn-ghost"
          >
            {loading ? t("accounts.loading") : t("accounts.more")}
          </button>
        </div>
      )}
      <p className="mt-4 text-xs text-[var(--sa-text-quaternary)]">
        {t("accounts.note")}
      </p>
    </section>
  );
}
