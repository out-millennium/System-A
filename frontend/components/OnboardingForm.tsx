"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { useT } from "@/lib/i18n";
import { playAction } from "@/lib/sound";
import { validateEmail, validatePassword } from "@/lib/email";
import PasswordInput from "@/components/PasswordInput";
import EmailInput from "@/components/EmailInput";
import ConfirmDialog from "@/components/ConfirmDialog";

type Me = {
  email: string | null;
  accountName: string | null;
  onboarded: boolean;
  providers: string[];
  hasPassword: boolean;
};

/* Onboarding step shown after the first sign-in (email / Google / GitHub).
   The user can link more sign-in methods, then choose an account name and
   password. Completing provisions the Core account. */
export default function OnboardingForm() {
  const t = useT();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [accountName, setAccountName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Site-style confirmation for discarding the pending account (no browser confirm).
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function loadMe() {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data: Me = await res.json();
      if (data.onboarded) {
        router.replace("/dashboard");
        return;
      }
      setMe(data);
      if (data.email) setEmail(data.email);
    } else {
      router.replace("/login");
    }
  }

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Linking a provider re-runs OAuth and returns to this page.
  function link(provider: "google" | "github") {
    signIn(provider, { callbackUrl: "/register" });
  }

  // Discard the pending account and sign out (confirmed via a site-style modal).
  async function handleCancel() {
    setLoading(true);
    try {
      await fetch("/api/auth/cancel", { method: "POST" });
    } catch {
      /* proceed to sign-out regardless */
    }
    await signOut({ redirect: false }).catch(() => {});
    window.location.href = "/";
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEmailError("");
    setPasswordError("");

    let hasError = false;

    // Validate the email only when the field is shown/filled.
    if (email) {
      const emailReason = validateEmail(email);
      if (emailReason !== null) {
        setEmailError(t("auth.emailInvalid"));
        hasError = true;
      }
    }

    // A password is only collected for OAuth-first accounts (no password yet).
    if (!me?.hasPassword) {
      const passwordReason = validatePassword(password);
      if (passwordReason !== null) {
        setPasswordError(
          passwordReason === "empty"
            ? t("auth.fieldRequired")
            : t("auth.passwordTooShort")
        );
        hasError = true;
      }
    }

    if (hasError) return;

    setLoading(true);
    const res = await fetch("/api/auth/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountName,
        // Only send a password when the account does not have one yet
        // (i.e. it was created through Google/GitHub). Email sign-ups already
        // set their password on the first screen.
        password: me?.hasPassword ? undefined : password,
        email: email || undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      // Honor a post-auth intent (e.g. the "become an admin" flow), else go to
      // the dashboard.
      let dest = "/dashboard";
      try {
        const intent = sessionStorage.getItem("postAuthRedirect");
        if (intent && intent.startsWith("/") && !intent.startsWith("//")) {
          dest = intent;
          sessionStorage.removeItem("postAuthRedirect");
        }
      } catch {}
      void playAction("confirm");
      window.location.href = dest;
    } else {
      if (data.error === "invalid_email") {
        setEmailError(t("auth.emailInvalid"));
      } else if (data.error === "name_reserved") {
        setError(t("register.nameReserved"));
      } else {
        setError(t("register.error"));
        void playAction("error");
      }
      setLoading(false);
    }
  }

  if (!me) {
    return (
      <div className="sa-panel p-8 text-center text-sm text-[var(--sa-text-tertiary)]">
        {t("summary.loading")}
      </div>
    );
  }

  const providerLabel = (p: string) =>
    p === "google"
      ? t("auth.providerGoogle")
      : p === "github"
        ? t("auth.providerGitHub")
        : t("auth.providerCredentials");

  const hasGoogle = me.providers.includes("google");
  const hasGitHub = me.providers.includes("github");

  return (
    <div className="space-y-6">
      {/* Linked sign-in methods */}
      <div className="sa-panel p-6">
        <p className="sa-eyebrow mb-4">{t("auth.linkedMethods")}</p>
        <div className="flex flex-wrap gap-2">
          {me.providers.map((p) => (
            <span key={p} className="sa-badge">
              {providerLabel(p)} · {t("auth.linked")}
            </span>
          ))}
        </div>

        <p className="sa-eyebrow mt-6 mb-3">{t("auth.linkMore")}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={hasGoogle}
            onClick={() => link("google")}
            className="sa-btn sa-btn-ghost w-full disabled:opacity-40"
          >
            {t("auth.linkGoogle")}
          </button>
          <button
            type="button"
            disabled={hasGitHub}
            onClick={() => link("github")}
            className="sa-btn sa-btn-ghost w-full disabled:opacity-40"
          >
            {t("auth.linkGitHub")}
          </button>
        </div>

        {/* The "sign in as admin?" link used to sit here, but during onboarding
            the account is not yet `onboarded`, so POST /api/apply-admin returns
            403 ("something went wrong"). Admin applications are done from the
            landing page's "Become an admin" flow AFTER onboarding, so the link
            is intentionally removed from this step. */}
      </div>

      {/* Account name + password */}
      <div className="sa-panel p-8">
        <p className="sa-eyebrow mb-5">{t("auth.setDetails")}</p>
        <form onSubmit={handleComplete} className="space-y-5">
          {!me.email && (
            <div>
              <label className="sa-label">{t("register.email")}</label>
              <EmailInput
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  if (emailError) setEmailError("");
                }}
                autoComplete="email"
              />
              {emailError && (
                <p className="mt-2 text-sm text-[var(--sa-danger)]">
                  {emailError}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="sa-label">{t("register.accountName")}</label>
            <input
              className="sa-input sa-mono"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              maxLength={64}
            />
            <p className="mt-2 text-xs text-[var(--sa-text-quaternary)]">
              {t("register.accountHint")}
            </p>
          </div>
          {/* Password is only collected for OAuth-first accounts that do not
              have one yet. Email sign-ups set it on the first screen. */}
          {!me.hasPassword && (
            <div>
              <label className="sa-label">{t("register.password")}</label>
              <PasswordInput
                value={password}
                onChange={(v) => {
                  setPassword(v);
                  if (passwordError) setPasswordError("");
                }}
                autoComplete="new-password"
              />
              {passwordError && (
                <p className="mt-2 text-sm text-[var(--sa-danger)]">
                  {passwordError}
                </p>
              )}
            </div>
          )}
          {error && <p className="text-sm text-[var(--sa-danger)]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="sa-btn sa-btn-primary w-full"
          >
            {loading ? t("auth.completing") : t("auth.complete")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            disabled={loading}
            className="w-full text-center text-xs text-[var(--sa-text-quaternary)] transition-colors hover:text-[var(--sa-danger)] disabled:opacity-40"
          >
            {t("auth.cancelCreation")}
          </button>
        </form>
      </div>

      {confirmCancel && (
        <ConfirmDialog
          danger
          title={t("auth.cancelConfirm")}
          description=""
          confirmLabel={t("auth.cancelCreation")}
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() => {
            setConfirmCancel(false);
            handleCancel();
          }}
        />
      )}
    </div>
  );
}
