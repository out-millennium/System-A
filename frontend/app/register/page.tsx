"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { signIn } from "next-auth/react";
import { useT } from "@/lib/i18n";
import { validateEmail, validatePassword } from "@/lib/email";
import OAuthButtons from "@/components/OAuthButtons";
import OnboardingForm from "@/components/OnboardingForm";
import AuthGate from "@/components/AuthGate";
import PasswordInput from "@/components/PasswordInput";
import { playAction } from "@/lib/sound";
import EmailInput from "@/components/EmailInput";
import SystemAPolicyConsentModal from "@/components/SystemAPolicyConsentModal";
import SystemAMark from "@/components/SystemAMark";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function RegisterPage() {
  const t = useT();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Can this deployment deliver email? Email/password sign-up needs it; when
  // unavailable we disable that path and steer users to platform sign-in.
  const [mailOk, setMailOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/mail-status")
      .then((r) => r.json())
      .then((d) => setMailOk(Boolean(d.available)))
      .catch(() => setMailOk(false));
  }, []);

  const user = session?.user as
    | { onboarded?: boolean; accountName?: string | null }
    | undefined;

  // A fully-onboarded user has no business on the sign-up page.
  useEffect(() => {
    if (status === "authenticated" && user?.onboarded) {
      router.replace("/dashboard");
    }
  }, [status, user?.onboarded, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEmailError("");
    setPasswordError("");

    // In-app validation (mirrors the server checks). Messages appear under the
    // relevant field, always in the selected page language.
    const emailReason = validateEmail(email);
    const passwordReason = validatePassword(password);
    let hasError = false;
    if (emailReason !== null) {
      setEmailError(
        emailReason === "empty" ? t("auth.fieldRequired") : t("auth.emailInvalid")
      );
      hasError = true;
    }
    if (passwordReason !== null) {
      setPasswordError(
        passwordReason === "empty"
          ? t("auth.fieldRequired")
          : t("auth.passwordTooShort")
      );
      hasError = true;
    }
    if (hasError) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Sign the pending account in, then continue to onboarding on this page.
        const signInResult = await signIn("credentials", {
          identifier: email,
          password,
          redirect: false,
        });
        if (!signInResult?.ok) {
          setError(t("register.error"));
          void playAction("error");
          return;
        }
        router.refresh();
      } else if (data.error === "invalid_email") {
        setEmailError(t("auth.emailInvalid"));
      } else if (data.error === "mail_unavailable") {
        setError(t("auth.mailUnavailableRegister"));
        void playAction("error");
      } else {
        setError(t("register.error"));
        void playAction("error");
      }
    } catch {
      setError(t("register.error"));
      void playAction("error");
    } finally {
      setLoading(false);
    }
  }

  // Signed in but not yet onboarded -> show the onboarding step.
  const showOnboarding =
    status === "authenticated" && user && !user.onboarded;

  return (
    <>
      <SystemAPolicyConsentModal />
      <AuthGate mode="register">
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
            {showOnboarding ? t("auth.onboardTitle") : t("register.title")}
          </h1>
          <p className="sa-lead mt-3 text-sm">
            {showOnboarding ? t("auth.onboardLead") : t("register.lead")}
          </p>
        </div>

        {showOnboarding ? (
          <OnboardingForm />
        ) : (
          <>
            <div className="sa-panel space-y-6 p-8">
              <OAuthButtons callbackUrl="/register" />

              {mailOk === false ? (
                // Email delivery is unavailable → email/password sign-up can't
                // verify an address. Disable it and explain; platform sign-in
                // (above) is the way in.
                <>
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-[var(--sa-line)]" />
                    <span className="text-xs text-[var(--sa-text-quaternary)]">
                      {t("auth.orEmail")}
                    </span>
                    <span className="h-px flex-1 bg-[var(--sa-line)]" />
                  </div>
                  <div className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-4">
                    <p className="text-sm text-[var(--sa-text-secondary)]">
                      {t("auth.mailUnavailableRegister")}
                    </p>
                  </div>
                  <div className="space-y-4 opacity-50">
                    <div>
                      <label htmlFor="register-email-disabled" className="sa-label">{t("register.email")}</label>
                      <input
                        id="register-email-disabled"
                        type="email"
                        className="sa-input"
                        value=""
                        disabled
                        placeholder={t("auth.mailFieldDisabled")}
                      />
                    </div>
                    <div>
                      <label htmlFor="register-password-disabled" className="sa-label">{t("register.password")}</label>
                      <input
                        id="register-password-disabled"
                        type="password"
                        className="sa-input"
                        value=""
                        disabled
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-[var(--sa-line)]" />
                    <span className="text-xs text-[var(--sa-text-quaternary)]">
                      {t("auth.orEmail")}
                    </span>
                    <span className="h-px flex-1 bg-[var(--sa-line)]" />
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label htmlFor="register-email" className="sa-label">{t("register.email")}</label>
                      <EmailInput
                        id="register-email"
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
                    <div>
                      <label htmlFor="register-password" className="sa-label">{t("register.password")}</label>
                      <PasswordInput
                        id="register-password"
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
                    {error && (
                      <p className="text-sm text-[var(--sa-danger)]">{error}</p>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="sa-btn sa-btn-primary w-full"
                    >
                      {loading ? t("register.submitting") : t("register.submit")}
                    </button>
                  </form>
                </>
              )}
            </div>

            <p className="mt-8 text-center text-sm text-[var(--sa-text-tertiary)]">
              {t("register.haveAccount")}{" "}
              <Link
                href="/login"
                className="text-[var(--sa-text-secondary)] underline-offset-4 transition-colors hover:text-[var(--sa-text)] hover:underline"
              >
                {t("register.signIn")}
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
      </AuthGate>
    </>
  );
}
