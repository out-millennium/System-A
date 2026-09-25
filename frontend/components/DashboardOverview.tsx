"use client";

import Link from "next/link";
import TransferForm from "@/components/TransferForm";
import LedgerTable from "@/components/LedgerTable";
import LedgerSummary from "@/components/LedgerSummary";
import CopyButton from "@/components/CopyButton";
import DashboardNotifier from "@/components/DashboardNotifier";
import WithdrawalConfirmations from "@/components/WithdrawalConfirmations";
import MuteDisabled from "@/components/MuteDisabled";
import ThemeToggle from "@/components/ThemeToggle";
import ServiceStatus from "@/components/ServiceStatus";
import ServiceVersions from "@/components/ServiceVersions";
import LogoutButton from "@/components/LogoutButton";
import { DashHeader } from "@/components/DashHeader";
import { useT } from "@/lib/i18n";

type Op = {
  operation_id: string;
  operation_type: string;
  to_account: string | null;
  amount: string;
  timestamp: string;
};

export default function DashboardOverview({
  account,
  balance,
  recentOps,
  initialMode,
  adminLevel,
}: {
  account: string;
  balance: string | null;
  recentOps: Op[];
  initialMode: "transfer" | "burn";
  adminLevel?: number | null;
}) {
  const t = useT();

  return (
    <div className="sa-dashboard-zoom relative min-h-screen">
      <DashHeader account={account} active="overview" />

      <main className="mx-auto max-w-[1200px] px-6 pb-28 pt-32 md:px-10 md:pt-28">
        {/* On entry: toast for new announcements + a modal notice for unread
            direct messages (the messages themselves live on /dashboard/messages). */}
        <DashboardNotifier />

        {/* Pending withdrawal confirmations requested by external applications. */}
        <WithdrawalConfirmations />

        {/* Balance hero + quick actions */}
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className="sa-panel relative overflow-hidden p-8 md:p-10">
            <div className="sa-grid-bg pointer-events-none absolute inset-0 opacity-60" />
            <div className="relative">
              <p className="sa-eyebrow">{t("dashboard.balance")}</p>
              <div className="mt-4 flex items-end gap-3">
                <span className="sa-mono sa-text-gradient text-6xl font-medium tracking-tight md:text-7xl">
                  {balance ?? "—"}
                </span>
                <span className="mb-2 text-sm text-[var(--sa-text-tertiary)]">
                  {t("dashboard.unitsA")}
                </span>
              </div>
              <p className="mt-6 flex flex-wrap items-center gap-2 text-xs text-[var(--sa-text-quaternary)]">
                <span className="sa-mono text-[var(--sa-text-tertiary)]">
                  {account}
                </span>
                <CopyButton value={account} />
                {adminLevel ? (
                  <span className="sa-mono font-semibold uppercase tracking-wide text-[var(--sa-danger)]">
                    · admin
                  </span>
                ) : (
                  <>· {t("dashboard.ledgerRecord")}</>
                )}
              </p>
            </div>
          </section>

          <section className="sa-card p-6 md:p-7">
            <p className="sa-eyebrow mb-5">{t("dashboard.quickActions")}</p>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction href="/dashboard?mode=transfer" label={t("dashboard.qaTransfer")} />
              <QuickAction href="/dashboard?mode=burn" label={t("dashboard.qaBurn")} />
              <QuickAction href="#history" label={t("dashboard.qaHistory")} />
              <QuickAction href="/dashboard/grm" label={t("dashboard.qaGrm")} />
            </div>
            {/* Non-admins can apply for admin rights (real flow at /become-admin;
                the old /admin-login stub now redirects there). */}
            {!adminLevel && (
              <Link
                href="/become-admin"
                className="mt-2 block rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-2.5 text-center text-sm text-[var(--sa-text-secondary)] transition-colors hover:text-[var(--sa-text)]"
              >
                {t("admin.becomeAdmin")}
              </Link>
            )}
            <div className="mt-6 border-t border-[var(--sa-line)] pt-5">
              <ServiceStatus />
            </div>
          </section>
        </div>

        {/* Summary */}
        <div className="mt-4">
          <LedgerSummary />
        </div>

        {/* Operation + recent */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <MuteDisabled>
            <TransferForm initialMode={initialMode} />
          </MuteDisabled>

          <section className="sa-card p-6 md:p-7">
            <p className="sa-eyebrow mb-5">{t("dashboard.recentOperations")}</p>
            {recentOps.length === 0 ? (
              <p className="text-sm text-[var(--sa-text-tertiary)]">
                {t("dashboard.noRecent")}
              </p>
            ) : (
              <div className="space-y-2">
                {recentOps.map((op) => {
                  const incoming =
                    op.to_account === account && op.operation_type !== "burn";
                  return (
                    <div
                      key={op.operation_id}
                      className="sa-surface !bg-[var(--sa-surface-0)] flex items-center gap-3 px-4 py-3"
                    >
                      <span
                        className={`sa-dot ${incoming ? "sa-dot-ok" : "sa-dot-err"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm capitalize text-[var(--sa-text)]">
                          {op.operation_type.replace("_", " ")}
                        </p>
                        <p className="text-[0.6875rem] text-[var(--sa-text-quaternary)]">
                          {new Date(op.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`sa-mono text-sm ${
                          incoming
                            ? "text-[var(--sa-ok)]"
                            : "text-[var(--sa-danger)]"
                        }`}
                      >
                        {incoming ? "+" : "−"}
                        {op.amount}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Full history */}
        <section id="history" className="mt-14 scroll-mt-28">
          <div className="mb-5 flex items-center justify-between">
            <p className="sa-eyebrow">{t("dashboard.operationHistory")}</p>
          </div>
          <LedgerTable account={account} />
        </section>

        <div className="mt-16 flex items-center justify-between border-t border-[var(--sa-line)] pt-6">
          <ServiceVersions />
          <div className="flex items-center gap-6">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </main>
    </div>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="sa-interactive sa-serif group flex items-center justify-between rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3 text-sm text-[var(--sa-text-secondary)]"
    >
      <span className="transition-colors group-hover:text-[var(--sa-text)]">
        {label}
      </span>
      <span className="text-[var(--sa-text-quaternary)] transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}
