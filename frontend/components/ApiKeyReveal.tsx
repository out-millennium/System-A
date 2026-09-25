"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";

/* View your own Core API key — password-gated, in a modal.
   Flow: button → modal (darkened backdrop) → enter account password → the field
   is replaced by the key shown BLURRED, with an eye toggle to reveal and a
   warning never to share it. The password is required EVERY time; the key is
   held only in local component state and cleared when the modal closes. */
export default function ApiKeyReveal() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function close() {
    // Wipe everything sensitive on close — nothing lingers.
    setOpen(false);
    setPassword("");
    setApiKey(null);
    setShow(false);
    setError("");
    setLoading(false);
  }

  async function reveal() {
    setError("");
    if (!password) return setError(t("profile.keyBadPassword"));
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reveal-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.apiKey) {
        setApiKey(d.apiKey);
        setPassword(""); // don't keep the password around once used
      } else if (d.error === "invalid_password") {
        setError(t("profile.keyBadPassword"));
      } else if (d.error === "no_key") {
        setError(t("profile.keyNone"));
      } else {
        setError(t("profile.keyFailed"));
      }
    } catch {
      setError(t("profile.keyFailed"));
    }
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sa-btn sa-btn-ghost w-full sm:w-auto"
      >
        {t("profile.viewKey")}
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="sa-glass w-full max-w-md rounded-[var(--sa-r-lg)] p-7"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h2 className="sa-heading text-lg">{t("profile.viewKeyTitle")}</h2>

            {apiKey === null ? (
              // Step 1: ask for the password.
              <>
                <p className="sa-lead mt-3 text-sm">{t("profile.viewKeyPrompt")}</p>
                <input
                  type="password"
                  className="sa-input mt-4 w-full"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder={t("profile.keyPasswordPrompt")}
                  autoComplete="current-password"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") reveal();
                  }}
                />
                {error && (
                  <p className="mt-3 text-sm text-[var(--sa-danger)]">{error}</p>
                )}
                {/* Stack on narrow widths, row when there is room; long labels
                    wrap neatly without stretching the sibling button. */}
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={close}
                    className="sa-btn sa-btn-ghost min-h-[2.75rem] flex-1 whitespace-normal text-center leading-snug"
                  >
                    {t("confirm.cancel")}
                  </button>
                  <button
                    onClick={reveal}
                    disabled={loading || !password}
                    className="sa-btn sa-btn-primary min-h-[2.75rem] flex-1 whitespace-normal text-center leading-snug"
                  >
                    {loading ? t("profile.keyRevealing") : t("profile.keyReveal")}
                  </button>
                </div>
              </>
            ) : (
              // Step 2: show the key blurred, with an eye toggle + warning.
              <>
                <p className="mt-3 text-sm text-[var(--sa-danger)]">
                  {t("profile.keyWarning")}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <code
                    className={`sa-mono flex-1 break-all rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-3 text-xs text-[var(--sa-text)] transition ${
                      show ? "" : "select-none blur-sm"
                    }`}
                  >
                    {apiKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? t("profile.keyHide") : t("profile.keyShow")}
                    title={show ? t("profile.keyHide") : t("profile.keyShow")}
                    className="sa-btn sa-btn-ghost shrink-0"
                  >
                    {show ? "🙈" : "👁"}
                  </button>
                </div>
                <div className="mt-7 flex justify-end">
                  <button onClick={close} className="sa-btn sa-btn-primary">
                    {t("profile.keyDone")}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
