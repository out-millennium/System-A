"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";

/* Revoke API key.
   • Regular users: revoke THEIR OWN key directly (confirmed). The server acts on
     the session's stored key — no key value is sent from the client.
   • Admins (level 1–4): cannot revoke directly — they file a revocation REQUEST
     with a reason (reviewed by level 4, or by the creator if the requester is 4).
   • The creator (level 5) cannot revoke their own key at all. */
export default function RevokeKeyForm() {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();

  const [role, setRole] = useState("user");
  const [adminLevel, setAdminLevel] = useState<number | null>(null);

  // Regular-user direct revoke.
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Confirm revocation with EITHER the account password OR the api_key itself.
  const [password, setPassword] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [method, setMethod] = useState<"password" | "apikey">("password");

  // Admin request flow.
  const [reason, setReason] = useState("");
  const [requestState, setRequestState] = useState<
    "none" | "open" | "approved" | "rejected"
  >("none");
  // "muted" | "banned" | "was_banned" | null — blocks key revocation entirely.
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setRole(d.role ?? "user");
        setAdminLevel(d.adminLevel ?? null);
        setBlocked(d.selfManageBlocked ?? null);
      })
      .catch(() => {});
    fetch("/api/auth/request-key-revocation")
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

  // ---- Regular user: direct revoke of their own key --------------------
  async function doRevoke() {
    setLoading(true);
    setError("");
    // Send whichever credential the user chose.
    const payload =
      method === "apikey" ? { apiKey: apiKeyInput.trim() } : { password };
    const res = await fetch("/api/auth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSuccess(true);
      setPassword("");
      setApiKeyInput("");
    } else if (data.error === "invalid_credentials" || data.error === "invalid_password") {
      setError(
        method === "apikey"
          ? t("settings.revokeBadKey")
          : t("settings.revokeBadPassword")
      );
    } else if (data.error === "no_key") {
      setError(t("settings.revokeNoKey"));
    } else {
      setError(t("settings.revokeFailed"));
    }
    setLoading(false);
    router.refresh();
  }

  // ---- Admin: file a revocation request --------------------------------
  async function submitRequest() {
    setError("");
    if (!reason.trim()) return setError(t("settings.revokeReasonRequired"));
    if (!password) return setError(t("settings.revokeBadPassword"));
    setLoading(true);
    const res = await fetch("/api/auth/request-key-revocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      setRequestState("open");
      setReason("");
      setPassword("");
      toast(t("settings.revokeRequestSent"), "success");
    } else if (data.error === "invalid_password") {
      setError(t("settings.revokeBadPassword"));
    } else if (data.error === "already_open") {
      setError(t("settings.revokeRequestOpen"));
    } else {
      setError(t("settings.revokeFailed"));
    }
  }

  return (
    <div className="sa-card p-6 md:p-7">
      <div className="mb-5">
        <p className="sa-eyebrow mb-2">{t("settings.revokeTitle")}</p>
        <p className="sa-lead text-xs">{t("settings.revokeDesc")}</p>
      </div>

      {blocked ? (
        // Muted / banned / ever-banned accounts can't revoke their key.
        <p className="text-sm text-[var(--sa-text-tertiary)]">
          {t(`auth.selfBlock_${blocked}`)}
        </p>
      ) : isCreator ? (
        // Creator cannot revoke their own key.
        <p className="text-sm text-[var(--sa-text-tertiary)]">
          {t("settings.revokeCreatorBlocked")}
        </p>
      ) : isAdmin ? (
        // Admin: request-based revocation.
        <>
          <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
            {t("settings.revokeAdminLead")}
          </p>
          {requestState === "open" ? (
            <p className="text-sm text-[var(--sa-text-secondary)]">
              {t("settings.revokeRequestOpen")}
            </p>
          ) : requestState === "rejected" ? (
            <p className="text-sm text-[var(--sa-text-secondary)]">
              {t("settings.revokeRequestRejected")}
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
                placeholder={t("settings.revokeReasonPrompt")}
              />
              <input
                type="password"
                className="sa-input w-full"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder={t("settings.revokePasswordPrompt")}
                autoComplete="current-password"
              />
              {error && (
                <p className="text-sm text-[var(--sa-danger)]">{error}</p>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={submitRequest}
                className="sa-btn sa-btn-danger w-full"
              >
                {t("settings.revokeRequestButton")}
              </button>
            </div>
          )}
        </>
      ) : (
        // Regular user: direct revoke of their own key.
        <>
          {success ? (
            <p className="mb-4 text-sm text-[var(--sa-ok)]">
              {t("settings.revoked")}
            </p>
          ) : (
            <>
              {error && (
                <p className="mb-3 text-sm text-[var(--sa-danger)]">{error}</p>
              )}
              {/* Choose how to confirm: account password or the api_key itself.
                  Same animated pill style as the login method switcher. */}
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
                        layoutId="revoke-method"
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
                <input
                  type="password"
                  className="sa-input sa-reveal mb-3 w-full"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder={t("settings.revokePasswordPrompt")}
                  autoComplete="current-password"
                />
              ) : (
                <input
                  type="text"
                  className="sa-input sa-mono mb-3 w-full"
                  value={apiKeyInput}
                  onChange={(e) => {
                    setApiKeyInput(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder={t("settings.revokeKeyPrompt")}
                  autoComplete="off"
                />
              )}
              <button
                type="button"
                disabled={
                  loading ||
                  (method === "password" ? !password : !apiKeyInput.trim())
                }
                onClick={() => setConfirm(true)}
                className="sa-btn sa-btn-danger w-full"
              >
                {loading ? t("settings.revoking") : t("settings.revokeButton")}
              </button>
            </>
          )}

          {confirm && (
            <ConfirmDialog
              danger
              title={t("settings.confirmRevoke")}
              description=""
              confirmLabel={t("settings.revokeButton")}
              onCancel={() => setConfirm(false)}
              onConfirm={() => {
                setConfirm(false);
                doRevoke();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
