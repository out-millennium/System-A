"use client";

import Link from "next/link";
import { DashHeader } from "@/components/DashHeader";
import { useT } from "@/lib/i18n";
import AnnouncementsManager from "@/components/AnnouncementsManager";
import MessagesSender from "@/components/MessagesSender";
import WarningsManager from "@/components/WarningsManager";
import UserModerationPanel from "@/components/UserModerationPanel";
import CreatorPanel from "@/components/CreatorPanel";
import AccountsDirectory from "@/components/AccountsDirectory";
import MuteDisabled from "@/components/MuteDisabled";
import SupportQueue from "@/components/SupportQueue";
import SupportComplaintsReview from "@/components/SupportComplaintsReview";

/* Admin panel shell. Sections are shown according to the admin's level; for now
   they are placeholders — the real tools land in later stages. Level meaning:
   1 public messages · 2 moderate + DMs · 3 warnings · 4 ban/mute + reports ·
   5 creator (absolute). Each level also has everything below it. */
export default function AdminView({
  account,
  level,
}: {
  account: string;
  level: number;
}) {
  const t = useT();

  return (
    <div className="sa-dashboard-zoom relative min-h-screen">
      <DashHeader account={account} active="profile" />

      <main className="mx-auto max-w-[900px] px-6 pb-28 pt-32 md:px-10 md:pt-28">
        <p className="sa-eyebrow mb-6 text-[var(--sa-danger)]">
          {t("admin.title")}
        </p>
        <h1 className="sa-heading sa-text-gradient text-4xl">
          {t("admin.panelOfLevel").replace("{level}", String(level))}
        </h1>

        {/* A muted admin may view the panel but not use its tools. */}
        <MuteDisabled>
          {/* Support queue: every admin handles tickets assigned to their tier. */}
          <SupportQueue level={level} />
          {level >= 4 && <SupportComplaintsReview />}

          {/* Stage 2 — system announcements (all admins can compose). */}
          <AnnouncementsManager level={level} />

          {/* Stage 3 — direct messages to users (level >= 2). */}
          {level >= 2 && <MessagesSender />}

          {/* Stage 4 — warnings & appeals (received/appeal: all; issue: >=3;
              review appeals: >=4). */}
          <WarningsManager level={level} />

          {/* Stage 5 — moderate users / lower admins (level >= 4). */}
          {level >= 4 && <UserModerationPanel />}

          {/* Review queues (applications, appeals, deletion & key-revocation
              requests) now live on a dedicated page — one clear place to act on
              everything, level-gated. Linked here for level >= 4. */}
          {level >= 4 && (
            <section className="sa-card mt-4 p-6 md:p-7">
              <p className="sa-eyebrow mb-4">{t("reviews.title")}</p>
              <Link
                href="/dashboard/admin/reviews"
                className="sa-interactive sa-serif group flex items-center justify-between rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3 text-sm text-[var(--sa-text-secondary)] transition-colors hover:border-[var(--sa-line-strong)] hover:text-[var(--sa-text)]"
              >
                <span>{t("reviews.openReviews")}</span>
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            </section>
          )}

          {/* Accounts directory with search + level filter (level >= 4). */}
          {level >= 4 && <AccountsDirectory viewerLevel={level} />}

          {/* Stage 6 — creator controls (level 5 only). */}
          {level >= 5 && <CreatorPanel />}
        </MuteDisabled>
      </main>
    </div>
  );
}
