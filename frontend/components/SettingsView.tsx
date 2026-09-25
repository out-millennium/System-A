"use client";

import Link from "next/link";
import RevokeKeyForm from "@/components/RevokeKeyForm";
import TwoFactorSettings from "@/components/TwoFactorSettings";
import HapticsToggle from "@/components/HapticsToggle";
import SoundSettingToggle from "@/components/SoundSettingToggle";
import DashboardSound from "@/components/DashboardSound";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import { DashHeader } from "@/components/DashHeader";
import { useI18n, useT } from "@/lib/i18n";
import SupportCenter from "@/components/SupportCenter";

export default function SettingsView({ account }: { account: string }) {
  const t = useT();
  const { locale } = useI18n();
  const policyTitle = locale === "ru" ? "Политика использования System A" : locale === "fr" ? "Politique d’utilisation de System A" : locale === "zh" ? "System A 使用政策" : "System A User Policy";
  const policyLabel = locale === "ru" ? "Открыть документ" : locale === "fr" ? "Ouvrir le document" : locale === "zh" ? "打开文件" : "Open document";

  return (
    <div className="sa-dashboard-zoom relative min-h-screen">
      <DashHeader account={account} active="settings" />

      <main className="mx-auto max-w-[800px] px-6 pb-28 pt-32 md:px-10 md:pt-28">
        <p className="sa-eyebrow mb-6">{t("settings.eyebrow")}</p>
        <h1 className="sa-heading sa-text-gradient text-4xl">
          {t("settings.title")}
        </h1>

        <DashboardSound />

        <TwoFactorSettings />

        <HapticsToggle />

        <SoundSettingToggle />

        <div className="mt-4">
          <RevokeKeyForm />
        </div>

        <section className="sa-card mt-4 p-6 md:p-7">
          <p className="sa-eyebrow mb-4">{t("settings.securityTitle")}</p>
          <Link
            href="/dashboard/profile"
            className="sa-interactive sa-serif group flex items-center justify-between rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3 text-sm text-[var(--sa-text-secondary)]"
          >
            <span className="transition-colors group-hover:text-[var(--sa-text)]">
              {t("settings.manageProfile")}
            </span>
            <span className="text-[var(--sa-text-quaternary)] transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </section>

        <section className="sa-card mt-4 p-6 md:p-7">
          <p className="sa-eyebrow mb-2">{policyTitle}</p>
          <p className="sa-lead mb-5 text-xs">
            {locale === "ru" ? "Пользовательский документ о правилах взаимодействия с System A." : "User-facing rules for interacting with System A."}
          </p>
          <Link href="/policy" className="sa-btn sa-btn-ghost">
            {policyLabel} →
          </Link>
        </section>

        <SupportCenter />

        <SupportCenter category="proposal" />

        <DeleteAccountForm />
      </main>
    </div>
  );
}
