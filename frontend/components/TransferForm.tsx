"use client";
import { useState, useCallback, useEffect } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import ConfirmDialog from "./ConfirmDialog";
import Toast from "./Toast";
import AccountPreview from "./AccountPreview";
import { useT } from "@/lib/i18n";
import { playAction } from "@/lib/sound";

const LARGE_AMOUNT_THRESHOLD = 1000;

export default function TransferForm({
  initialMode = "transfer",
}: {
  initialMode?: "transfer" | "burn";
}) {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"transfer" | "burn">(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      setToast({ message, type });
    },
    []
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseInt(amount);
    if (mode === "burn" || amt >= LARGE_AMOUNT_THRESHOLD) {
      setConfirm(true);
      return;
    }
    execute();
  }

  async function execute() {
    setConfirm(false);
    setLoading(true);
    setError("");

    try {
      const endpoint = mode === "transfer" ? "/api/transfer" : "/api/burn";
      const body =
        mode === "transfer"
          ? { to_account: to, amount: parseInt(amount) }
          : { amount: parseInt(amount) };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTo("");
        setAmount("");
        showToast(
          mode === "transfer" ? t("transfer.completed") : t("transfer.burned"),
          "success"
        );
        void playAction(mode === "transfer" ? "transfer" : "confirm");
        router.refresh();
      } else {
        const msg = data.error || t("transfer.failed");
        setError(msg);
        showToast(msg, "error");
        void playAction("error");
      }
    } catch {
      const msg = t("transfer.failed");
      setError(msg);
      showToast(msg, "error");
      void playAction("error");
    } finally {
      setLoading(false);
    }
  }

  const amt = parseInt(amount) || 0;
  const confirmTitle =
    mode === "burn"
      ? t("transfer.confirmBurnTitle")
      : t("transfer.confirmLargeTitle");
  const confirmDesc =
    mode === "burn"
      ? t("transfer.confirmBurnDesc", { amount })
      : t("transfer.confirmLargeDesc", {
          amount,
          recipient: to,
          threshold: LARGE_AMOUNT_THRESHOLD,
        });

  return (
    <>
      <AnimatePresence>
        {confirm && (
          <ConfirmDialog
            title={confirmTitle}
            description={confirmDesc}
            confirmLabel={mode === "burn" ? t("transfer.burn") : t("transfer.transfer")}
            danger={mode === "burn"}
            onConfirm={execute}
            onCancel={() => setConfirm(false)}
          />
        )}
      </AnimatePresence>
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

      <section className="sa-card p-6 md:p-7">
        <p className="sa-eyebrow mb-5">{t("transfer.operation")}</p>

        {/* Segmented control */}
        <div className="mb-6 inline-flex rounded-full border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-1">
          {(["transfer", "burn"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`sa-serif relative rounded-full px-5 py-1.5 text-sm transition-colors ${
                mode === m
                  ? "text-[var(--sa-text)]"
                  : "text-[var(--sa-text-tertiary)] hover:text-[var(--sa-text-secondary)]"
              }`}
            >
              {mode === m && (
                <motion.span
                  layoutId="transfer-mode"
                  className="absolute inset-0 rounded-full bg-[var(--sa-surface-2)] ring-1 ring-[var(--sa-line-strong)]"
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
              <span className="relative">
                {m === "transfer" ? t("transfer.transfer") : t("transfer.burn")}
              </span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence initial={false} mode="popLayout">
            {mode === "transfer" && (
              <motion.div
                key="recipient"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <label className="sa-label">{t("transfer.recipient")}</label>
                <input
                  className="sa-input sa-mono"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  pattern="^[a-zA-Z0-9_\-\.]+$"
                  required={mode === "transfer"}
                />
                {/* Live recipient preview (regular users see only name/existence). */}
                <div className="mt-2">
                  <AccountPreview identifier={to} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label className="sa-label">{t("transfer.amount")}</label>
            <div className="sa-number-field">
              <input
                type="number"
                min="1"
                step="1"
                className="sa-input sa-mono"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <div className="sa-stepper" aria-hidden="true">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={t("transfer.increase")}
                  onClick={() =>
                    setAmount((v) => String(Math.max(1, (parseInt(v) || 0) + 1)))
                  }
                >
                  <svg viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2.5 7.5 6 4l3.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={t("transfer.decrease")}
                  onClick={() =>
                    setAmount((v) => String(Math.max(1, (parseInt(v) || 0) - 1)))
                  }
                >
                  <svg viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2.5 4.5 6 8l3.5-3.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {mode === "burn" && (
            <p className="text-xs text-[var(--sa-text-quaternary)]">
              {t("transfer.burnWarning")}
            </p>
          )}
          {mode === "transfer" && amt >= LARGE_AMOUNT_THRESHOLD && (
            <p className="text-xs text-[var(--sa-warn)]">
              {t("transfer.largeWarning")}
            </p>
          )}
          {error && (
            <p className="text-sm text-[var(--sa-danger)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`sa-btn w-full ${
              mode === "burn" ? "sa-btn-danger" : "sa-btn-primary"
            }`}
          >
            {loading
              ? t("transfer.processing")
              : mode === "transfer"
                ? t("transfer.send")
                : t("transfer.burn")}
          </button>
        </form>
      </section>
    </>
  );
}
