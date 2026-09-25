"use client";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import Toast from "./Toast";
import { useT } from "@/lib/i18n";
import { playAction } from "@/lib/sound";
import PasswordInput from "@/components/PasswordInput";
import { validatePassword } from "@/lib/email";

export default function PasswordChangeForm() {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [currentError, setCurrentError] = useState("");
  const [nextError, setNextError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCurrentError("");
    setNextError("");

    let hasError = false;
    if (current.length === 0) {
      setCurrentError(t("auth.fieldRequired"));
      hasError = true;
    }
    const nextReason = validatePassword(next);
    if (nextReason !== null) {
      setNextError(
        nextReason === "empty"
          ? t("auth.fieldRequired")
          : t("auth.passwordTooShort")
      );
      hasError = true;
    }
    if (hasError) return;

    setLoading(true);
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const data = await res.json();
    if (res.ok) {
      setCurrent("");
      setNext("");
      setToast({ message: t("profile.updated"), type: "success" });
      void playAction("confirm");
    } else if (data.error === "current_incorrect") {
      setCurrentError(t("profile.currentIncorrect"));
    } else if (data.error === "invalid_password") {
      setNextError(t("auth.passwordTooShort"));
    } else {
      setToast({ message: t("profile.failed"), type: "error" });
      void playAction("error");
    }
    setLoading(false);
  }

  return (
    <>
      <AnimatePresence>
        {toast && (
          <div className="fixed bottom-6 right-6 z-[90]">
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          </div>
        )}
      </AnimatePresence>
      <div className="sa-card p-6 md:p-7">
        <p className="sa-eyebrow mb-5">{t("profile.changePassword")}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="sa-label">{t("profile.currentPassword")}</label>
            <PasswordInput
              value={current}
              onChange={(v) => {
                setCurrent(v);
                if (currentError) setCurrentError("");
              }}
              autoComplete="current-password"
            />
            {currentError && (
              <p className="mt-2 text-sm text-[var(--sa-danger)]">
                {currentError}
              </p>
            )}
          </div>
          <div>
            <label className="sa-label">{t("profile.newPassword")}</label>
            <PasswordInput
              value={next}
              onChange={(v) => {
                setNext(v);
                if (nextError) setNextError("");
              }}
              autoComplete="new-password"
            />
            {nextError && (
              <p className="mt-2 text-sm text-[var(--sa-danger)]">
                {nextError}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="sa-btn sa-btn-primary w-full"
          >
            {loading ? t("profile.updating") : t("profile.updatePassword")}
          </button>
        </form>
      </div>
    </>
  );
}
