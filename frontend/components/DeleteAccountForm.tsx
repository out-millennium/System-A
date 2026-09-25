"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import PasswordInput from "@/components/PasswordInput";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";

/* Danger zone.
   • Regular users: delete their account directly (password-confirmed).
   • Admins (level 1–4): cannot self-delete — they file a deletion REQUEST with
     a reason (reviewed by level 4, or by the creator if the requester is 4).
   • The creator (level 5) cannot delete their account at all. */
export default function DeleteAccountForm() {
  const t = useT();
  const { toast } = useToast();

  const [hasPassword, setHasPassword] = useState(true);
  const [role, setRole] = useState<string>("user");
  const [adminLevel, setAdminLevel] = useState<number | null>(null);

  const [password, setPassword] = useState("");
  // Confirm deletion by account password OR by the account's own API key.
  const [method, setMethod] = useState<"password" | "apikey">("password");
  const [apiKey, setApiKey] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [requestState, setRequestState] = useState<
    "none" | "open" | "approved" | "rejected"
  >("none");
  // "muted" | "banned" | "was_banned" | null — blocks self-deletion entirely.
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setHasPassword(Boolean(d.hasPassword));
        setRole(d.role ?? "user");
        setAdminLevel(d.adminLevel ?? null);
        setBlocked(d.selfManageBlocked ?? null);
      })
      .catch(() => {});
    fetch("/api/auth/request-deletion")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const s = d?.request?.status;
        if (s === "open" || s === "approved" || s === "rejected")
          setRequestState(s);
      })
      .catch(() => {});
  }, []);

  const isAdmin = role === "admin" && !!adminLevel;
  const isCreator = adminLevel != null && adminLevel >= 5;

  // ---- Regular user: direct delete -------------------------------------
  async function directDelete() {
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        method === "apikey"
          ? { apiKey }
          : { password: hasPassword ? password : undefined }
      ),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      await signOut({ redirect: false }).catch(() => {});
      window.location.href = "/";
      return;
    }
    if (data.error === "password_required") setError(t("auth.deletePasswordRequired"));
    else if (data.error === "invalid_password") setError(t("auth.deleteInvalidPassword"));
    else setError(t("auth.deleteError"));
    setLoading(false);
  }

  // ---- Admin: file a deletion request ----------------------------------
  async function submitRequest() {
    setError("");
    if (!reason.trim()) return setError(t("auth.deleteReasonRequired"));
    setLoading(true);
    const res = await fetch("/api/auth/request-deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      setRequestState("open");
      setReason("");
      toast(t("auth.deleteRequestSent"), "success");
    } else if (data.error === "already_open") {
      setError(t("auth.deleteRequestOpen"));
    } else {
      setError(t("auth.deleteError"));
    }
  }

  return (
    <section className="sa-card mt-4 border-[var(--sa-danger)]/30 p-6 md:p-7">
      <p className="sa-eyebrow mb-2 text-[var(--sa-danger)]">
        {t("auth.deleteTitle")}
      </p>

      {/* Muted / banned / ever-banned accounts can't delete themselves. */}
      {blocked ? (
        <p className="text-sm text-[var(--sa-text-tertiary)]">
          {t(`auth.selfBlock_${blocked}`)}
        </p>
      ) : isCreator ? (
        <p className="text-sm text-[var(--sa-text-tertiary)]">
          {t("auth.deleteCreatorBlocked")}
        </p>
      ) : isAdmin ? (
        // Admin: request-based deletion
        <>
          <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
            {t("auth.deleteAdminLead")}
          </p>
          {requestState === "open" ? (
            <p className="text-sm text-[var(--sa-text-secondary)]">
              {t("auth.deleteRequestOpen")}
            </p>
          ) : requestState === "rejected" ? (
            <p className="text-sm text-[var(--sa-text-secondary)]">
              {t("auth.deleteRequestRejected")}
            </p>
          ) : (
            <div className="space-y-3">
              <textarea
                className="sa-textarea w-full"
                rows={2}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError("");
                }}
                placeholder={t("auth.deleteReasonPrompt")}
              />
              {error && (
                <p className="text-sm text-[var(--sa-danger)]">{error}</p>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={submitRequest}
                className="sa-btn rounded-[var(--sa-r-sm)] border border-[var(--sa-danger)]/50 bg-[var(--sa-danger)]/10 text-[var(--sa-danger)] transition-colors hover:border-[var(--sa-danger)]/80 hover:bg-[var(--sa-danger)]/20"
              >
                {t("auth.deleteRequestButton")}
              </button>
            </div>
          )}
        </>
      ) : (
        // Regular user: direct delete
        <>
          <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
            {t("auth.deleteLead")}
          </p>

          {/* Confirm by account password OR by the account's own API key. */}
          <div className="mb-3 inline-flex rounded-full border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-1">
            {(["password", "apikey"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMethod(m);
                  if (error) setError("");
                }}
                className={`relative rounded-full px-5 py-1.5 text-sm transition-colors ${
                  method === m
                    ? "text-[var(--sa-text)]"
                    : "text-[var(--sa-text-tertiary)] hover:text-[var(--sa-text-secondary)]"
                }`}
              >
                {method === m && (
                  <motion.span
                    layoutId="delete-method"
                    className="absolute inset-0 rounded-full bg-[var(--sa-surface-2)] ring-1 ring-[var(--sa-line-strong)]"
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <span className="relative">
                  {m === "password"
                    ? t("settings.revokeByPassword")
                    : t("settings.revokeByKey")}
                </span>
              </button>
            ))}
          </div>

          {method === "password" ? (
            hasPassword && (
              <div className="mb-3">
                <label className="sa-label">{t("auth.deletePasswordPrompt")}</label>
                <PasswordInput
                  value={password}
                  onChange={(v) => {
                    setPassword(v);
                    if (error) setError("");
                  }}
                  autoComplete="current-password"
                />
              </div>
            )
          ) : (
            <div className="sa-reveal mb-3">
              <label className="sa-label">{t("settings.revokeKeyPrompt")}</label>
              <input
                type="text"
                className="sa-input sa-mono w-full"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (error) setError("");
                }}
                placeholder={t("login.apiKeyPrompt")}
                autoComplete="off"
              />
            </div>
          )}
          {error && <p className="mb-3 text-sm text-[var(--sa-danger)]">{error}</p>}
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (method === "password" && hasPassword && !password.trim())
                return setError(t("auth.deletePasswordRequired"));
              if (method === "apikey" && !apiKey.trim())
                return setError(t("settings.revokeKeyRequired"));
              setConfirm(true);
            }}
            className="sa-btn rounded-[var(--sa-r-sm)] border border-[var(--sa-danger)]/50 bg-[var(--sa-danger)]/10 text-[var(--sa-danger)] transition-colors hover:border-[var(--sa-danger)]/80 hover:bg-[var(--sa-danger)]/20"
          >
            {t("auth.deleteButton")}
          </button>
        </>
      )}

      {confirm && (
        <ConfirmDialog
          danger
          title={t("auth.deleteConfirmTitle")}
          description={t("auth.deleteLead")}
          confirmLabel={t("auth.deleteConfirmButton")}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            directDelete();
          }}
        />
      )}
    </section>
  );
}
