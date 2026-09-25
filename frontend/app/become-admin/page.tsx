"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n";
import Select from "@/components/Select";
import SystemAMark from "@/components/SystemAMark";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function BecomeAdminPage() {
  const t = useT();
  const { status } = useSession();
  const [reason, setReason] = useState("");
  const [level, setLevel] = useState("1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<
    "form" | "submitted" | "open" | "approved" | "rejected" | "isadmin" | "ineligible"
  >("form");
  const [eligibility, setEligibility] = useState<{ eligible: boolean; eligibleAt: string | null; activityCount: number } | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/apply-admin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setEligibility({
          eligible: Boolean(d?.eligible),
          eligibleAt: d?.eligibleAt ?? null,
          activityCount: Number(d?.activityCount ?? 0),
        });
        if (d?.isAdmin) {
          setState("isadmin");
          return;
        }
        if (!d?.eligible) {
          setState("ineligible");
          return;
        }
        const s = d?.application?.status;
        if (s === "open") setState("open");
        else if (s === "approved") setState("approved");
        else if (s === "rejected") setState("rejected");
      })
      .catch(() => {});
  }, [status]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!reason.trim()) return setError(t("apply.reasonRequired"));
    setBusy(true);
    const res = await fetch("/api/apply-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, requestedLevel: Number(level) }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setState("submitted");
    else if (d.error === "already_admin") setError(t("apply.alreadyAdmin"));
    else if (d.error === "already_open") setError(t("apply.alreadyOpen"));
    else if (d.error === "account_too_new" || d.error === "no_activity") {
      setState("ineligible");
    } else if (d.error === "invalid_level") setError(t("apply.invalidLevel"));
    else setError(t("apply.error"));
  }

  const statusMsg =
    state === "submitted"
      ? t("apply.submitted")
      : state === "open"
        ? t("apply.statusOpen")
        : state === "approved"
          ? t("apply.statusApproved")
          : state === "rejected"
            ? t("apply.statusRejected")
            : state === "isadmin"
              ? t("apply.alreadyAdmin")
              : state === "ineligible"
                ? t("apply.eligibilityRequired")
                : "";

  return (
    <div className="relative flex min-h-[100svh] items-center justify-center px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <Link href="/" className="sa-eyebrow inline-flex items-center gap-2">
            <SystemAMark className="h-5 w-5" />
            System A
          </Link>
          <h1 className="sa-heading sa-text-gradient mt-6 text-4xl">
            {t("apply.title")}
          </h1>
          <p className="sa-lead mt-3 text-sm">{t("apply.lead")}</p>
        </div>

        <div className="sa-panel p-8">
          {status !== "authenticated" ? (
            <div className="text-center">
              <p className="sa-lead text-sm">{t("apply.signInFirst")}</p>
              <Link
                href="/login?callbackUrl=/become-admin"
                onClick={() => {
                  try {
                    sessionStorage.setItem("postAuthRedirect", "/become-admin");
                  } catch {}
                }}
                className="sa-btn sa-btn-primary mt-6 w-full"
              >
                {t("nav.signIn")}
              </Link>
            </div>
          ) : statusMsg ? (
            <div className="text-center">
              <p className="sa-lead whitespace-pre-line text-sm">{statusMsg}</p>
              {state === "ineligible" && eligibility && (
                <div className="mt-4 space-y-2 text-left text-xs text-[var(--sa-text-tertiary)]">
                  <p>{t("apply.eligibilityAge")}</p>
                  <p>{t("apply.eligibilityActivity").replace("{n}", String(eligibility.activityCount))}</p>
                </div>
              )}
              <Link href="/" className="sa-btn sa-btn-ghost mt-6 w-full">
                {t("nav.home")}
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="sa-label">{t("apply.reason")}</label>
                <textarea
                  className="sa-textarea w-full"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div>
                <label className="sa-label">{t("apply.requestedLevel")}</label>
                <Select
                  ariaLabel={t("apply.requestedLevel")}
                  value={level}
                  onChange={setLevel}
                  options={[1, 2, 3, 4].map((n) => ({
                    value: String(n),
                    label: String(n),
                  }))}
                />
              </div>
              {error && (
                <p className="text-sm text-[var(--sa-danger)]">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="sa-btn sa-btn-primary w-full"
              >
                {busy ? t("apply.submitting") : t("apply.submit")}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
