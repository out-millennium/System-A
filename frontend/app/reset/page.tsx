"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { validatePassword } from "@/lib/email";
import PasswordInput from "@/components/PasswordInput";
import SystemAMark from "@/components/SystemAMark";

const EASE = [0.22, 1, 0.36, 1] as const;

function ResetInner() {
  const t = useT();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPasswordError("");

    const reason = validatePassword(password);
    if (reason !== null) {
      setPasswordError(
        reason === "empty" ? t("auth.fieldRequired") : t("auth.passwordTooShort")
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
      } else if (data.error === "invalid_token") {
        setError(t("reset.invalidToken"));
      } else if (data.error === "invalid_password") {
        setPasswordError(t("reset.invalidPassword"));
      } else {
        setError(t("reset.error"));
      }
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
            {t("reset.title")}
          </h1>
          <p className="sa-lead mt-3 text-sm">{t("reset.lead")}</p>
        </div>

        <div className="sa-panel p-8">
          {done ? (
            <div className="space-y-6">
              <p className="text-sm text-[var(--sa-text-secondary)]">
                {t("reset.done")}
              </p>
              <Link href="/login" className="sa-btn sa-btn-primary w-full">
                {t("reset.backToLogin")}
              </Link>
            </div>
          ) : !token ? (
            <p className="text-sm text-[var(--sa-danger)]">
              {t("reset.invalidToken")}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="sa-label">{t("reset.newPassword")}</label>
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
              {error && (
                <p className="text-sm text-[var(--sa-danger)]">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="sa-btn sa-btn-primary w-full"
              >
                {loading ? t("reset.submitting") : t("reset.submit")}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}
