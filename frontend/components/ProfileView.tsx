"use client";

import Link from "next/link";
import PasswordChangeForm from "@/components/PasswordChangeForm";
import ApiKeyReveal from "@/components/ApiKeyReveal";
import SignInMethods from "@/components/SignInMethods";
import SessionsAndActivity from "@/components/SessionsAndActivity";
import RestrictionStatus from "@/components/RestrictionStatus";
import ModerationFeed from "@/components/ModerationFeed";
import AdminApplicationStatus from "@/components/AdminApplicationStatus";
import { DashHeader } from "@/components/DashHeader";
import { useT } from "@/lib/i18n";

export default function ProfileView({
  email,
  accountName,
  memberSince,
  role,
  adminLevel,
}: {
  email: string;
  accountName: string;
  memberSince: string;
  role?: string;
  adminLevel?: number | null;
}) {
  const t = useT();
  const isAdmin = role === "admin" && !!adminLevel;

  const fields = [
    { label: t("profile.email"), value: email },
    { label: t("profile.accountName"), value: accountName, mono: true },
    { label: t("profile.memberSince"), value: memberSince },
    ...(isAdmin
      ? [
          {
            label: t("profile.role"),
            value: t("profile.roleAdmin"),
            danger: true,
          },
          {
            label: t("profile.adminLevel"),
            value: String(adminLevel),
            mono: true,
          },
        ]
      : []),
  ];

  return (
    <div className="sa-dashboard-zoom relative min-h-screen">
      <DashHeader account={accountName} active="profile" />

      <main className="mx-auto max-w-[800px] px-6 pb-28 pt-32 md:px-10 md:pt-28">
        <p className="sa-eyebrow mb-6">{t("profile.eyebrow")}</p>
        <h1 className="sa-heading sa-text-gradient text-4xl">
          {t("profile.title")}
        </h1>

        <section className="sa-card mt-10 p-6 md:p-7">
          <p className="sa-eyebrow mb-5">{t("profile.accountInformation")}</p>
          <dl className="grid gap-px overflow-hidden rounded-[var(--sa-r-md)] border border-[var(--sa-line)] bg-[var(--sa-line-faint)] sm:grid-cols-3">
            {fields.map((f) => (
              <div key={f.label} className="bg-[var(--sa-surface-0)] p-4">
                <dt className="text-[0.6875rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
                  {f.label}
                </dt>
                <dd
                  className={`mt-2 break-all text-sm ${
                    (f as { danger?: boolean }).danger
                      ? "font-semibold uppercase text-[var(--sa-danger)]"
                      : "text-[var(--sa-text)]"
                  } ${f.mono ? "sa-mono" : ""}`}
                >
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* System API key — view your own key (password-gated). */}
        <section className="sa-card mt-4 p-6 md:p-7">
          <p className="sa-eyebrow mb-2">{t("profile.apiKeyTitle")}</p>
          <p className="sa-lead mb-5 text-xs">{t("profile.apiKeyDesc")}</p>
          <ApiKeyReveal />
        </section>

        {/* Sign-in methods + active sessions and recent security events
            (moved here from Settings). */}
        <SignInMethods />
        <SessionsAndActivity />

        {/* Admin-application status (own application: status + withdraw; or a
            reviewer shortcut for level >= 4 admins). */}
        <AdminApplicationStatus />

        {/* Active restriction (mute/ban) with remaining time, if any. */}
        <RestrictionStatus />

        {/* Unified moderation activity: warnings, bans/mutes, appeals, requests. */}
        <ModerationFeed />

        {isAdmin && (
          <section className="sa-card mt-4 border-[var(--sa-danger)]/30 p-6 md:p-7">
            <p className="sa-eyebrow mb-4 text-[var(--sa-danger)]">
              {t("admin.title")}
            </p>
            <Link
              href="/dashboard/admin"
              className="sa-interactive sa-serif group flex items-center justify-between rounded-[var(--sa-r-sm)] border border-[var(--sa-danger)]/40 bg-[var(--sa-danger)]/5 px-4 py-3 text-sm text-[var(--sa-danger)] transition-colors hover:border-[var(--sa-danger)]/70 hover:bg-[var(--sa-danger)]/10"
            >
              <span className="font-medium">{t("admin.openPanel")}</span>
              <span className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </section>
        )}

        <section className="sa-card mt-4 p-6 md:p-7">
          <p className="sa-eyebrow mb-4">{t("analytics.title")}</p>
          <Link
            href="/dashboard/analytics"
            className="sa-interactive sa-serif group flex items-center justify-between rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3 text-sm text-[var(--sa-text-secondary)]"
          >
            <span className="transition-colors group-hover:text-[var(--sa-text)]">
              {t("analytics.openLink")}
            </span>
            <span className="text-[var(--sa-text-quaternary)] transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </section>

        <div className="mt-4">
          <PasswordChangeForm />
        </div>
      </main>
    </div>
  );
}
