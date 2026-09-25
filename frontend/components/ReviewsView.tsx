"use client";

import Link from "next/link";
import { DashHeader } from "@/components/DashHeader";
import { useT } from "@/lib/i18n";
import ApplicationsReview from "@/components/ApplicationsReview";
import ModerationAppealsReview from "@/components/ModerationAppealsReview";
import DeletionRequestsReview from "@/components/DeletionRequestsReview";
import KeyRevocationRequestsReview from "@/components/KeyRevocationRequestsReview";

/* Admin "Reviews" page — every review queue in one place, each gated to the
   level that may act on it. Reuses the existing, tested review components so
   behaviour/permissions stay identical to the admin panel; this just gives them
   a dedicated, linkable home (reached from the profile's application card).

   Level rules (mirror the admin panel):
     • level ≥ 4 : admin applications, ban/mute appeals, deletion requests,
                   key-revocation requests. */
export default function ReviewsView({
  account,
  level,
}: {
  account: string;
  level: number;
}) {
  const t = useT();
  const canReview = level >= 4;

  return (
    <div className="sa-dashboard-zoom relative min-h-screen">
      <DashHeader account={account} active="profile" />

      <main className="mx-auto max-w-[900px] px-6 pb-28 pt-32 md:px-10 md:pt-28">
        <Link href="/dashboard/admin" className="sa-navlink text-xs">
          ← {t("admin.openPanel")}
        </Link>

        <p className="sa-eyebrow mb-6 mt-6">{t("reviews.eyebrow")}</p>
        <h1 className="sa-heading sa-text-gradient text-4xl">
          {t("reviews.title")}
        </h1>
        <p className="sa-lead mt-4 max-w-2xl text-sm">
          {t("reviews.lead").replace("{level}", String(level))}
        </p>

        {!canReview ? (
          <section className="sa-card mt-8 p-6 md:p-7">
            <p className="text-sm text-[var(--sa-text-tertiary)]">
              {t("reviews.noAccess")}
            </p>
          </section>
        ) : (
          <>
            {/* Admin applications (level ≥ 4). */}
            <ApplicationsReview reviewerLevel={level} />
            {/* Ban/mute appeals. */}
            <ModerationAppealsReview />
            {/* Admin account-deletion requests. */}
            <DeletionRequestsReview />
            {/* Admin API-key revocation requests. */}
            <KeyRevocationRequestsReview />
          </>
        )}
      </main>
    </div>
  );
}
