"use client";

import { useState, useCallback, useEffect } from "react";
import { useT } from "@/lib/i18n";
import ConfirmDialog from "@/components/ConfirmDialog";
import AccountPreview from "@/components/AccountPreview";

type Op = {
  operation_id: string;
  operation_type: string;
  from_account: string | null;
  to_account: string | null;
  amount: string;
  timestamp: string;
};

type AuditEntry = {
  id: string;
  action: string;
  actor: string | null;
  target: string | null;
  detail: string | null;
  createdAt: string;
};

/* Creator-only (level 5) controls: assign/remove roles, revoke keys, delete
   accounts, and view the global operations ledger. */
export default function CreatorPanel() {
  const t = useT();
  const [identifier, setIdentifier] = useState("");
  const [level, setLevel] = useState("1");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [ops, setOps] = useState<Op[]>([]);
  const [offset, setOffset] = useState(0);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Which creator action awaits confirmation: "revokeKey" | "setRole" | null.
  const [pending, setPending] = useState<"revokeKey" | "setRole" | null>(null);

  const errText = (code: string) =>
    ({
      user_not_found: t("creator.userNotFound"),
      cannot_self: t("creator.cannotSelf"),
      cannot_creator: t("creator.cannotCreator"),
      invalid_level: t("creator.invalidLevel"),
      no_key: t("creator.noKey"),
      identifier_required: t("creator.idRequired"),
      invalid_password: t("creator.badPassword"),
    })[code] ?? t("creator.error");

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setError("");
    setMsg("");
    if (!identifier.trim()) return setError(t("creator.idRequired"));
    setBusy(true);
    const res = await fetch("/api/admin/creator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, action, ...extra }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg(t("creator.done"));
      loadAudit();
    } else setError(errText(d.error));
  }

  const loadAudit = useCallback(async () => {
    const res = await fetch("/api/admin/audit-log");
    if (res.ok) setAudit((await res.json()).entries ?? []);
  }, []);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  const loadOps = useCallback(async (off: number) => {
    const res = await fetch(`/api/admin/operations?offset=${off}&limit=20`);
    if (res.ok) {
      const d = await res.json();
      setOps(Array.isArray(d) ? d : []);
    }
  }, []);

  return (
    <section className="sa-card mt-4 border-[var(--sa-danger)]/40 p-6 md:p-7">
      <p className="sa-eyebrow mb-2 text-[var(--sa-danger)]">
        {t("creator.title")}
      </p>
      <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
        {t("creator.lead")}
      </p>

      <div className="space-y-3">
        <input
          className="sa-input"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={t("creator.identifier")}
        />
        <AccountPreview identifier={identifier} />
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="sa-input w-40"
            type="number"
            min={0}
            max={4}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder={t("creator.level")}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!identifier.trim()) return setError(t("creator.idRequired"));
              setPending("setRole");
            }}
            className="sa-btn sa-btn-primary !py-1.5 text-xs"
          >
            {t("creator.setRole")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!identifier.trim()) return setError(t("creator.idRequired"));
              setPending("revokeKey");
            }}
            className="sa-btn sa-btn-ghost !py-1.5 text-xs"
          >
            {t("creator.revokeKey")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!identifier.trim()) {
                setError(t("creator.idRequired"));
                return;
              }
              setConfirmDelete(true);
            }}
            className="sa-btn sa-btn-ghost !py-1.5 text-xs text-[var(--sa-danger)]"
          >
            {t("creator.deleteAccount")}
          </button>
        </div>
        {error && <p className="text-sm text-[var(--sa-danger)]">{error}</p>}
        {msg && <p className="text-sm text-[var(--sa-ok)]">{msg}</p>}
      </div>

      {/* Global operations */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <p className="sa-eyebrow">{t("creator.operations")}</p>
          <button
            type="button"
            onClick={() => {
              setOffset(0);
              loadOps(0);
            }}
            className="sa-btn sa-btn-ghost !rounded-[var(--sa-r-sm)] !px-3 !py-1.5 text-xs"
          >
            {t("creator.refresh")}
          </button>
        </div>
        {ops.length > 0 && (
          <>
            <div className="space-y-1">
              {ops.map((o) => (
                <div
                  key={o.operation_id}
                  className="flex items-center justify-between rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-3 py-2 text-xs"
                >
                  <span className="sa-mono text-[var(--sa-text-tertiary)]">
                    {o.operation_type} · {o.from_account ?? "—"} →{" "}
                    {o.to_account ?? "—"}
                  </span>
                  <span className="sa-mono text-[var(--sa-text)]">
                    {o.amount}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => {
                  const o = Math.max(0, offset - 20);
                  setOffset(o);
                  loadOps(o);
                }}
                className="sa-btn sa-btn-ghost !rounded-[var(--sa-r-sm)] !px-3 !py-1.5 text-xs disabled:opacity-40"
              >
                {t("creator.prev")}
              </button>
              <button
                type="button"
                disabled={ops.length < 20}
                onClick={() => {
                  const o = offset + 20;
                  setOffset(o);
                  loadOps(o);
                }}
                className="sa-btn sa-btn-ghost !rounded-[var(--sa-r-sm)] !px-3 !py-1.5 text-xs disabled:opacity-40"
              >
                {t("creator.next")}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Audit log of creator actions */}
      <div className="mt-8">
        <p className="sa-eyebrow mb-3">{t("creator.auditTitle")}</p>
        {audit.length === 0 ? (
          <p className="text-sm text-[var(--sa-text-tertiary)]">
            {t("creator.auditEmpty")}
          </p>
        ) : (
          <div className="space-y-1">
            {audit.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-3 py-2 text-xs"
              >
                <span className="text-[var(--sa-text-secondary)]">
                  {t(`creator.audit_${a.action.replace("creator.", "")}`)} ·{" "}
                  <span className="sa-mono">{a.target}</span>
                  {a.detail ? ` — ${a.detail}` : ""}
                </span>
                <span className="text-[var(--sa-text-quaternary)]">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {pending === "setRole" && (
        <ConfirmDialog
          title={t("creator.confirmSetRole")}
          description={`${t("creator.identifier")}: ${identifier} · ${t("creator.level")}: ${level}`}
          confirmLabel={t("creator.setRole")}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            call("setRole", { level: Number(level) });
          }}
        />
      )}

      {pending === "revokeKey" && (
        <ConfirmDialog
          danger
          requirePassword
          passwordPrompt={t("creator.passwordPrompt")}
          title={t("creator.confirmRevokeKey")}
          description={`${t("creator.identifier")}: ${identifier}`}
          confirmLabel={t("creator.revokeKey")}
          onCancel={() => setPending(null)}
          onConfirm={(password) => {
            setPending(null);
            call("revokeKey", { password });
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          danger
          title={t("creator.confirmDelete")}
          description={`${t("creator.identifier")}: ${identifier}`}
          confirmLabel={t("creator.deleteAccount")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            call("deleteAccount");
          }}
        />
      )}
    </section>
  );
}
