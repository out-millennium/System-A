"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

/* Withdrawal confirmation prompts.

   When a recognized external application requests a withdrawal for this account,
   a pending challenge appears here. The owner confirms ("this is me") — which
   reveals a 6-digit code to type back into the external app — or denies it.
   The account password is NOT involved and never leaves System A. */

type Challenge = {
  id: number;
  external_ref: string;
  app_name: string | null;
  amount: string | null;
  created_at: string | null;
  expires_at: string | null;
};

export default function WithdrawalConfirmations() {
  const t = useT();
  const [items, setItems] = useState<Challenge[]>([]);
  const [expired, setExpired] = useState<
    { id: number; app_name: string | null; amount: string | null; expired_at: string | null }[]
  >([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [code, setCode] = useState<{ id: number; value: string } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/withdrawal-confirmations", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) {
        setItems(d.challenges ?? []);
        // Expired notices are returned once by the server; keep any already shown
        // in this session so they don't vanish on the next poll.
        if (Array.isArray(d.expired) && d.expired.length > 0) {
          setExpired((prev) => {
            const seen = new Set(prev.map((x) => x.id));
            return [...prev, ...d.expired.filter((x: { id: number }) => !seen.has(x.id))];
          });
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // load() is async — any setState happens after an await, not synchronously
    // in the effect body — so this is safe; the lint rule can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // Poll so a request made while the user is on the page shows up.
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  async function act(id: number, action: "approve" | "deny") {
    setBusy(id);
    setError("");
    try {
      const r = await fetch("/api/auth/withdrawal-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const d = await r.json();
      if (r.ok) {
        if (action === "approve" && d.code) {
          setCode({ id, value: d.code });
        } else {
          setCode(null);
        }
        load();
      } else {
        setError(t("withdrawal.failed"));
      }
    } catch {
      setError(t("withdrawal.failed"));
    }
    setBusy(null);
  }

  // Nothing pending, no code, and no expired notices → render nothing.
  if (items.length === 0 && !code && expired.length === 0) return null;

  return (
    <section className="sa-card mt-4 border-[var(--sa-danger)]/30 p-6 md:p-7">
      <p className="sa-eyebrow mb-2 text-[var(--sa-danger)]">
        {t("withdrawal.title")}
      </p>
      <p className="sa-lead mb-5 text-xs">{t("withdrawal.lead")}</p>

      {error && (
        <p className="mb-3 text-sm text-[var(--sa-danger)]">{error}</p>
      )}

      {code && (
        <div className="mb-5 rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-4">
          <p className="text-xs text-[var(--sa-text-quaternary)]">
            {t("withdrawal.codeLabel")}
          </p>
          <p className="sa-mono mt-1 text-2xl tracking-[0.3em] text-[var(--sa-text)]">
            {code.value}
          </p>
          <p className="mt-2 text-xs text-[var(--sa-text-tertiary)]">
            {t("withdrawal.codeHint")}
          </p>
        </div>
      )}

      {expired.length > 0 && (
        <div className="mb-5 space-y-2">
          {expired.map((e) => (
            <div
              key={`exp-${e.id}`}
              className="flex items-center justify-between gap-3 rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-3"
            >
              <p className="text-xs text-[var(--sa-text-secondary)]">
                {t("withdrawal.expiredNotice")
                  .replace("{app}", e.app_name || "external app")
                  .replace("{amount}", e.amount ?? "?")
                  .replace(
                    "{when}",
                    e.expired_at ? new Date(e.expired_at).toLocaleString() : "—"
                  )}
              </p>
              <button
                type="button"
                onClick={() => setExpired((prev) => prev.filter((x) => x.id !== e.id))}
                className="shrink-0 text-xs text-[var(--sa-text-quaternary)] hover:text-[var(--sa-text)]"
                aria-label={t("withdrawal.dismiss")}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {items.map((c) => (
          <div
            key={c.id}
            className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-4"
          >
            <p className="text-sm text-[var(--sa-text)]">
              {t("withdrawal.request")
                .replace("{app}", c.app_name || "external app")
                .replace("{amount}", c.amount ?? "?")}
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                disabled={busy === c.id}
                onClick={() => act(c.id, "approve")}
                className="sa-btn sa-btn-primary flex-1"
              >
                {t("withdrawal.itsMe")}
              </button>
              <button
                type="button"
                disabled={busy === c.id}
                onClick={() => act(c.id, "deny")}
                className="sa-btn sa-btn-danger flex-1"
              >
                {t("withdrawal.notMe")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
