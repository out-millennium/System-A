"use client";

import { useEffect, useState, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useT } from "@/lib/i18n";
import MuteDisabled from "@/components/MuteDisabled";
import ConfirmDialog from "@/components/ConfirmDialog";

type Me = {
  email: string | null;
  accountName: string | null;
  onboarded: boolean;
  providers: string[];
  hasPassword: boolean;
};

/* Account settings: manage the ways to sign in to THIS (already created)
   account — link Google/GitHub, or remove a method. Mirrors the onboarding
   linking UI but for an existing account, and adds removal with a guard so the
   last remaining method can never be removed. */
export default function SignInMethods() {
  const t = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Which provider's unlink awaits confirmation.
  const [pendingUnlink, setPendingUnlink] = useState<
    "google" | "github" | "credentials" | null
  >(null);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    if (res.ok) setMe(await res.json());
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  // Linking re-runs OAuth and returns to this settings page.
  function link(provider: "google" | "github") {
    signIn(provider, { callbackUrl: "/dashboard/settings" });
  }

  async function unlink(provider: "google" | "github" | "credentials") {
    setError("");
    setBusy(provider);
    const res = await fetch("/api/auth/unlink", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const data = await res.json();
    if (res.ok) {
      await loadMe();
    } else {
      setError(
        data.error === "last_method"
          ? t("auth.lastMethodError")
          : t("auth.unlinkError")
      );
    }
    setBusy(null);
  }

  if (!me) {
    return (
      <section className="sa-card mt-4 p-6 md:p-7 text-sm text-[var(--sa-text-tertiary)]">
        {t("summary.loading")}
      </section>
    );
  }

  const has = (p: string) => me.providers.includes(p);
  const methodCount = me.providers.length;

  const label = (p: string) =>
    p === "google"
      ? t("auth.providerGoogle")
      : p === "github"
        ? t("auth.providerGitHub")
        : t("auth.credentialsMethod");

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-2">{t("auth.manageMethodsTitle")}</p>
      <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
        {t("auth.manageMethodsLead")}
      </p>

      {/* Currently linked methods */}
      <div className="space-y-2">
        {me.providers.map((p) => (
          <div
            key={p}
            className="flex items-center justify-between rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3"
          >
            <span className="text-sm text-[var(--sa-text)]">
              {label(p)} · {t("auth.linked")}
            </span>
            <button
              type="button"
              // The last remaining method cannot be removed.
              disabled={methodCount <= 1 || busy === p}
              onClick={() =>
                setPendingUnlink(p as "google" | "github" | "credentials")
              }
              className="text-xs text-[var(--sa-text-quaternary)] transition-colors hover:text-[var(--sa-danger)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {t("auth.unlink")}
            </button>
          </div>
        ))}
      </div>

      {/* Link additional methods (restricted users cannot add methods) */}
      {(!has("google") || !has("github")) && (
        <MuteDisabled>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {!has("google") && (
            <button
              type="button"
              onClick={() => link("google")}
              className="sa-btn sa-btn-ghost w-full"
            >
              {t("auth.linkGoogle")}
            </button>
          )}
          {!has("github") && (
            <button
              type="button"
              onClick={() => link("github")}
              className="sa-btn sa-btn-ghost w-full"
            >
              {t("auth.linkGitHub")}
            </button>
          )}
        </div>
        </MuteDisabled>
      )}

      {error && (
        <p className="mt-4 text-sm text-[var(--sa-danger)]">{error}</p>
      )}

      {pendingUnlink && (
        <ConfirmDialog
          danger
          title={t("auth.unlinkConfirmTitle")}
          description={t("auth.unlinkConfirm")}
          confirmLabel={t("auth.unlink")}
          onCancel={() => setPendingUnlink(null)}
          onConfirm={() => {
            const p = pendingUnlink;
            setPendingUnlink(null);
            if (p) unlink(p);
          }}
        />
      )}
    </section>
  );
}
