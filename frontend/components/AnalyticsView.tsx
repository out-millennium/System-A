"use client";

import Link from "next/link";
import AnalyticsChart from "@/components/AnalyticsChart";
import { DashHeader } from "@/components/DashHeader";
import { useT } from "@/lib/i18n";

export default function AnalyticsView({ account }: { account: string }) {
  const t = useT();

  return (
    <div className="sa-dashboard-zoom relative min-h-screen">
      <DashHeader account={account} active="analytics" />

      <main className="mx-auto max-w-[1000px] px-6 pb-28 pt-32 md:px-10 md:pt-28">
        <p className="sa-eyebrow mb-6">{t("analytics.title")}</p>
        <h1 className="sa-heading sa-text-gradient text-4xl">
          {t("analytics.chartTitle")}
        </h1>

        <div className="mt-10">
          <AnalyticsChart account={account} />
        </div>

        <p className="mt-8 text-sm text-[var(--sa-text-tertiary)]">
          <Link
            href="/dashboard/profile"
            className="text-[var(--sa-text-secondary)] underline-offset-4 transition-colors hover:text-[var(--sa-text)] hover:underline"
          >
            ← {t("analytics.back")}
          </Link>
        </p>
      </main>
    </div>
  );
}
