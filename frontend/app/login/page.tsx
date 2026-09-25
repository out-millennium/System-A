"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import OAuthButtons from "@/components/OAuthButtons";
import PasswordInput from "@/components/PasswordInput";
import { playAction } from "@/lib/sound";
import AuthGate from "@/components/AuthGate";
import SystemAPolicyConsentModal from "@/components/SystemAPolicyConsentModal";
import SystemAMark from "@/components/SystemAMark";

const EASE = [0.22, 1, 0.36, 1] as const;

/* Read a same-site relative callback URL from the query string, defaulting to
   the dashboard. Only internal paths ("/...") are allowed, to avoid open
   redirects. */
function safeCallbackUrl(): string {
  if (typeof window === "undefined") return "/dashboard";
  const ok = (v: string | null) =>
    !!v && v.startsWith("/") && !v.startsWith("//");
  // A post-auth intent (e.g. the "become an admin" flow) wins over the query.
  try {
    const intent = sessionStorage.getItem("postAuthRedirect");
    if (ok(intent)) {
      sessionStorage.removeItem("postAuthRedirect");
      return intent as string;
    }
  } catch {}
  const cb = new URLSearchParams(window.location.search).get("callbackUrl");
  if (ok(cb)) return cb as string;
  return "/dashboard";
}

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [authMethod, setAuthMethod] = useState<"password" | "apikey">("password");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Whether this deployment can deliver email (drives password-reset visibility
  // and the "we can't send email" notice). Derived from real mail capability.
  const [mailOk, setMailOk] = useState<boolean | null>(null);
  // Accounts remembered on this device (from the logout cookie). Chips pre-fill
  // the identifier; a credential is ALWAYS still required to actually sign in.
  const [remembered, setRemembered] = useState<
    { name: string; at: number; fresh: boolean }[]
  >([]);

  useEffect(() => {
    fetch("/api/auth/mail-status")
      .then((r) => r.json())
      .then((d) => setMailOk(Boolean(d.available)))
      .catch(() => setMailOk(false));
    // Read the (non-secret) remembered-accounts cookie.
    try {
      const m = document.cookie
        .split("; ")
        .find((c) => c.startsWith("remembered_accounts="));
      if (m) {
        const parsed = JSON.parse(decodeURIComponent(m.split("=")[1]));
        if (Array.isArray(parsed)) {
          // Compute "fresh" (logged out < 24h ago) ONCE here, so render stays
          // pure (no Date.now() during render).
          const now = Date.now();
          setRemembered(
            parsed
              .filter((x) => x?.name)
              .map((x) => ({
                name: x.name,
                at: x.at,
                fresh: now - x.at < 24 * 60 * 60 * 1000,
              }))
          );
        }
      }
    } catch {
      /* ignore malformed cookie */
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await signIn("credentials", {
        identifier,
        ...(authMethod === "apikey" ? { apiKey } : { password }),
        totp,
        redirect: false,
      });
      if (res?.ok) {
        router.push(safeCallbackUrl());
      } else if (res?.error === "2fa_required") {
        // Password was correct; ask for the second factor.
        setNeedTotp(true);
        void playAction("confirm");
      } else if (res?.error === "2fa_invalid") {
        setNeedTotp(true);
        setError(t("login.totpInvalid"));
        void playAction("error");
      } else {
        setError(t("login.error"));
        void playAction("error");
      }
    } catch {
      setError(t("login.error"));
      void playAction("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SystemAPolicyConsentModal />
      <AuthGate>
    <div className="relative flex min-h-[100svh] items-center justify-center px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="w-full max-w-md"
      >
        <div className="mb-10 text-center">
          <Link
            href="/"
            className="sa-eyebrow inline-flex items-center gap-2 transition-colors hover:text-[var(--sa-text-secondary)]"
          >
            <SystemAMark className="h-5 w-5" />
            System A
          </Link>
          <h1 className="sa-heading sa-text-gradient mt-6 text-4xl">
            {t("login.title")}
          </h1>
          <p className="sa-lead mt-3 text-sm">{t("login.lead")}</p>
        </div>

        <div className="sa-panel space-y-6 p-8">
          <OAuthButtons callbackUrl="/dashboard" />

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--sa-line)]" />
            <span className="text-xs text-[var(--sa-text-quaternary)]">
              {t("auth.orEmail")}
            </span>
            <span className="h-px flex-1 bg-[var(--sa-line)]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {remembered.length > 0 && (
              <div>
                <label className="sa-label">{t("login.rememberedTitle")}</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {remembered.map((r) => {
                    const fresh = r.fresh;
                    return (
                      <button
                        key={r.name}
                        type="button"
                        onClick={() => {
                          setIdentifier(r.name);
                          setError("");
                        }}
                        className="rounded-full border border-[var(--sa-line)] px-3 py-1 text-xs text-[var(--sa-text-secondary)] transition-colors hover:text-[var(--sa-text)]"
                        title={
                          fresh
                            ? t("login.rememberedFresh")
                            : t("login.rememberedStale")
                        }
                      >
                        <span className="sa-mono">{r.name}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-[var(--sa-text-quaternary)]">
                  {t("login.rememberedHint")}
                </p>
              </div>
            )}
            <div>
              <label htmlFor="login-identifier" className="sa-label">{t("auth.identifier")}</label>
              <input
                id="login-identifier"
                type="text"
                className="sa-input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
              />
            </div>
            {/* When email delivery is unavailable, tell users plainly and offer
                the api-key alternative (they can't reset a lost password). */}
            {mailOk === false && (
              <p className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-3 text-xs text-[var(--sa-text-tertiary)]">
                {t("auth.mailUnavailableLogin")}
              </p>
            )}
            {/* Segmented control (same pill style as the transfer/burn toggle
                in the dashboard) — an animated pill slides under the active
                option instead of a hard square swap. */}
            <div className="inline-flex rounded-full border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-1">
              {(["password", "apikey"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setAuthMethod(m);
                    setError("");
                  }}
                  className={`relative rounded-full px-5 py-1.5 text-sm transition-colors ${
                    authMethod === m
                      ? "text-[var(--sa-text)]"
                      : "text-[var(--sa-text-tertiary)] hover:text-[var(--sa-text-secondary)]"
                  }`}
                >
                  {authMethod === m && (
                    <motion.span
                      layoutId="login-authmethod"
                      className="absolute inset-0 rounded-full bg-[var(--sa-surface-2)] ring-1 ring-[var(--sa-line-strong)]"
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                  <span className="relative">
                    {m === "password" ? t("login.byPassword") : t("login.byKey")}
                  </span>
                </button>
              ))}
            </div>
            {authMethod === "password" ? (
              <div className="sa-reveal">
                <label htmlFor="login-password" className="sa-label">{t("login.password")}</label>
                <PasswordInput
                  id="login-password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="login-api-key" className="sa-label">{t("login.apiKeyLabel")}</label>
                <input
                  id="login-api-key"
                  type="text"
                  className="sa-input sa-mono"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t("login.apiKeyPrompt")}
                  autoComplete="off"
                />
                <p className="mt-2 text-xs text-[var(--sa-text-quaternary)]">
                  {t("login.apiKeyHint")}
                </p>
              </div>
            )}
            {needTotp && (
              <div>
                <label htmlFor="login-totp" className="sa-label">{t("login.totpLabel")}</label>
                <input
                  id="login-totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="sa-input sa-mono tracking-[0.3em]"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  placeholder="000000"
                  autoFocus
                />
                <p className="mt-2 text-xs text-[var(--sa-text-quaternary)]">
                  {t("login.totpHint")}
                </p>
              </div>
            )}
            {error && (
              <p className="text-sm text-[var(--sa-danger)]">{error}</p>
            )}
            <button
              type="submit"
              disabled={
                loading ||
                !identifier ||
                (authMethod === "password" ? !password : !apiKey)
              }
              className="sa-btn sa-btn-primary w-full"
            >
              {loading ? t("login.submitting") : t("login.submit")}
            </button>
            {/* Password reset needs email; hide it when mail is unavailable. */}
            {mailOk !== false && (
              <p className="text-center text-sm">
                <Link
                  href="/forgot"
                  className="text-[var(--sa-text-tertiary)] underline-offset-4 transition-colors hover:text-[var(--sa-text)] hover:underline"
                >
                  {t("reset.forgotLink")}
                </Link>
              </p>
            )}
          </form>
        </div>

        <p className="mt-8 text-center text-sm text-[var(--sa-text-tertiary)]">
          {t("login.noAccount")}{" "}
          <Link
            href="/register"
            className="text-[var(--sa-text-secondary)] underline-offset-4 transition-colors hover:text-[var(--sa-text)] hover:underline"
          >
            {t("login.createOne")}
          </Link>
        </p>
      </motion.div>
    </div>
      </AuthGate>
    </>
  );
}
