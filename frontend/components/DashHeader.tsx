"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ModerationGate from "@/components/ModerationGate";
import NotificationBell from "@/components/NotificationBell";
import CommandPalette from "@/components/CommandPalette";
import SystemAMark from "@/components/SystemAMark";

/* Shared dashboard header, reused across dashboard pages. Client component so
   the navigation labels can be localised. Account name is passed in as a prop
   by the server pages (auth stays server-side). */
export function DashHeader({
  account,
  active,
}: {
  account?: string;
  active?:
    | "overview"
    | "grm"
    | "grm-system"
    | "analytics"
    | "messages"
    | "profile"
    | "settings";
}) {
  const t = useT();
  const nav: Array<{
    key: NonNullable<typeof active>;
    href: string;
    label: string;
  }> = [
    { key: "overview", href: "/dashboard", label: t("dashboard.navOverview") },
    // Systemic GRM is reached from within the /dashboard/grm page (link there),
    // not the top nav — keeps the nav focused.
    { key: "grm", href: "/dashboard/grm", label: t("dashboard.navGrm") },
    { key: "analytics", href: "/dashboard/analytics", label: t("dashboard.navAnalytics") },
    { key: "messages", href: "/dashboard/messages", label: t("dashboard.navMessages") },
    { key: "profile", href: "/dashboard/profile", label: t("dashboard.navProfile") },
    { key: "settings", href: "/dashboard/settings", label: t("dashboard.navSettings") },
  ];

  return (
    <>
    <ModerationGate />
    {/* ⌘K / Ctrl-K command palette (global within the dashboard). */}
    <CommandPalette />
    <header className="sa-nav">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-3.5 md:px-10">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center"
            aria-label="SYSTEM A"
          >
            <SystemAMark className="h-6 w-6" />
            <span className="sa-wordmark text-base">SYSTEM&nbsp;A</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                className={`sa-serif rounded-full px-3 py-1.5 text-sm transition-colors ${
                  active === n.key
                    ? "bg-[var(--sa-surface-2)] text-[var(--sa-text)] ring-1 ring-[var(--sa-line-strong)]"
                    : "text-[var(--sa-text-tertiary)] hover:text-[var(--sa-text)]"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {account && <NotificationBell />}
          <LanguageSwitcher />
          {account && (
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-[var(--sa-text-quaternary)] sm:inline">
                {t("dashboard.signedInAs")}
              </span>
              <span className="sa-badge sa-mono">{account}</span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-[var(--sa-line-faint)] px-6 py-2 md:hidden">
        {nav.map((n) => (
          <Link
            key={n.key}
            href={n.href}
            className={`sa-serif whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${
              active === n.key
                ? "bg-[var(--sa-surface-2)] text-[var(--sa-text)]"
                : "text-[var(--sa-text-tertiary)]"
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
    </>
  );
}

export default DashHeader;
