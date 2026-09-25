"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import SystemAMark from "@/components/SystemAMark";
import { validateEmail } from "@/lib/email";
import EmailInput from "@/components/EmailInput";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [devLink, setDevLink] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");

    if (validateEmail(email) !== null) {
      setEmailError(t("auth.emailInvalid"));
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && data.error === "mail_unavailable") {
        setError(t("auth.mailUnavailableLogin"));
        return;
      }
      if (!res.ok) {
        setError(t("reset.error"));
        return;
      }
      // Dev-only convenience: the API returns the reset link when no SMTP is set.
      if (data.devLink) setDevLink(data.devLink);
      // Always show the same confirmation (no account enumeration).
      setDone(true);
    } catch {
      setError(t("reset.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
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
            {t("reset.forgotTitle")}
          </h1>
          <p className="sa-lead mt-3 text-sm">{t("reset.forgotLead")}</p>
        </div>

        <div className="sa-panel p-8">
          {done ? (
            <>
              <p className="text-sm text-[var(--sa-text-secondary)]">
                {t("reset.forgotDone")}
              </p>
              {devLink && (
                <a
                  href={devLink}
                  className="mt-4 block break-all text-xs text-[var(--sa-text-quaternary)] underline"
                >
                  {devLink}
                </a>
              )}
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
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
                {error && (
                  <p className="mt-2 text-sm text-[var(--sa-danger)]">{error}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="sa-btn sa-btn-primary w-full"
              >
                {loading ? t("reset.forgotSending") : t("reset.forgotSubmit")}
              </button>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-[var(--sa-text-tertiary)]">
          <Link
            href="/login"
            className="text-[var(--sa-text-secondary)] underline-offset-4 transition-colors hover:text-[var(--sa-text)] hover:underline"
          >
            {t("reset.backToLogin")}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
