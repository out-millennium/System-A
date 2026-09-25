"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";

/* Two-factor authentication settings.
   States: loading -> (disabled: show Enable) | (setup: QR + code) |
   (recovery: show one-time codes) | (enabled: show Disable). */
export default function TwoFactorSettings() {
  const t = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"idle" | "setup" | "recovery" | "disable">(
    "idle"
  );
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [secretCopied, setSecretCopied] = useState(false);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      setEnabled(Boolean(data.totpEnabled));
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function startSetup() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setQr(data.qr);
      setSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl || "");
      setMode("setup");
    } else {
      setError(t("auth.twoFaInvalid"));
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/auth/2fa/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: code }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setRecovery(data.recoveryCodes || []);
      setCode("");
      setMode("recovery");
      setEnabled(true);
    } else {
      setError(t("auth.twoFaInvalid"));
    }
  }

  async function confirmDisable(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/auth/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: code }),
    });
    setBusy(false);
    if (res.ok) {
      setCode("");
      setMode("idle");
      setEnabled(false);
    } else {
      setError(t("auth.twoFaInvalid"));
    }
  }

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <div className="mb-2 flex items-center justify-between">
        <p className="sa-eyebrow">{t("auth.twoFaTitle")}</p>
        {enabled !== null && (
          <span
            className={`sa-badge ${enabled ? "text-[var(--sa-text)]" : "text-[var(--sa-text-quaternary)]"}`}
          >
            {enabled ? t("auth.twoFaStatusOn") : t("auth.twoFaStatusOff")}
          </span>
        )}
      </div>
      <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
        {t("auth.twoFaLead")}
      </p>

      {/* Enabled + idle -> offer disable */}
      {enabled && mode === "idle" && (
        <button
          type="button"
          onClick={() => {
            setError("");
            setMode("disable");
          }}
          className="sa-btn sa-btn-ghost"
        >
          {t("auth.twoFaDisable")}
        </button>
      )}

      {/* Disabled + idle -> offer enable */}
      {!enabled && mode === "idle" && (
        <button
          type="button"
          onClick={startSetup}
          disabled={busy}
          className="sa-btn sa-btn-primary"
        >
          {t("auth.twoFaEnable")}
        </button>
      )}

      {/* Setup: QR + confirm code */}
      {mode === "setup" && (
        <form onSubmit={confirmEnable} className="space-y-4">
          <p className="text-sm text-[var(--sa-text-secondary)]">
            {t("auth.twoFaScan")}
          </p>
          {qr && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={qr}
              alt="2FA QR"
              className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-white p-2"
              width={180}
              height={180}
            />
          )}
          {/* Open directly in an authenticator app (works on mobile). */}
          {otpauthUrl && (
            <a
              href={otpauthUrl}
              className="sa-btn sa-btn-ghost inline-block text-xs"
            >
              {t("auth.twoFaOpenApp")}
            </a>
          )}
          {/* Manual entry: copy the secret into any authenticator app. */}
          <div className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-3">
            <p className="mb-2 text-xs text-[var(--sa-text-tertiary)]">
              {t("auth.twoFaSecret")}
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="sa-mono break-all text-sm text-[var(--sa-text)]">
                {secret}
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(secret);
                    setSecretCopied(true);
                    setTimeout(() => setSecretCopied(false), 1500);
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
                className="shrink-0 text-xs text-[var(--sa-text-quaternary)] transition-colors hover:text-[var(--sa-text-secondary)]"
              >
                {secretCopied ? t("auth.copiedLabel") : t("auth.copyLabel")}
              </button>
            </div>
          </div>
          <div>
            <label className="sa-label">{t("auth.twoFaCode")}</label>
            <input
              type="text"
              inputMode="numeric"
              className="sa-input sa-mono tracking-[0.3em]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
            />
          </div>
          {error && <p className="text-sm text-[var(--sa-danger)]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="sa-btn sa-btn-primary"
            >
              {t("auth.twoFaConfirm")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setCode("");
                setError("");
              }}
              className="sa-btn sa-btn-ghost"
            >
              {t("auth.twoFaCancel")}
            </button>
          </div>
        </form>
      )}

      {/* Recovery codes */}
      {mode === "recovery" && (
        <div className="space-y-4">
          <p className="sa-eyebrow">{t("auth.twoFaRecoveryTitle")}</p>
          <p className="text-xs text-[var(--sa-text-tertiary)]">
            {t("auth.twoFaRecoveryLead")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {recovery.map((c) => (
              <span
                key={c}
                className="sa-mono rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-3 py-2 text-sm text-[var(--sa-text)]"
              >
                {c}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="sa-btn sa-btn-primary"
          >
            {t("auth.twoFaRecoveryDone")}
          </button>
        </div>
      )}

      {/* Disable: require a current code */}
      {mode === "disable" && (
        <form onSubmit={confirmDisable} className="sa-reveal space-y-4">
          <p className="text-sm text-[var(--sa-text-secondary)]">
            {t("auth.twoFaDisablePrompt")}
          </p>
          <div>
            <label className="sa-label">{t("auth.twoFaCode")}</label>
            <input
              type="text"
              inputMode="numeric"
              className="sa-input sa-mono tracking-[0.3em]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
            />
          </div>
          {error && <p className="text-sm text-[var(--sa-danger)]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="sa-btn sa-btn-primary"
            >
              {t("auth.twoFaDisable")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setCode("");
                setError("");
              }}
              className="sa-btn sa-btn-ghost"
            >
              {t("auth.twoFaCancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
