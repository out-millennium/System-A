"use client";

import { DashHeader } from "@/components/DashHeader";
import MessagesInbox from "@/components/MessagesInbox";
import { useT } from "@/lib/i18n";

/* Dedicated page for a user's direct messages from admins. */
export default function MessagesView({ account }: { account: string }) {
  const t = useT();

  return (
    <div className="sa-dashboard-zoom relative min-h-screen">
      <DashHeader account={account} active="messages" />

      <main className="mx-auto max-w-[800px] px-6 pb-28 pt-32 md:px-10 md:pt-28">
        <p className="sa-eyebrow mb-6">{t("messages.pageEyebrow")}</p>
        <h1 className="sa-heading sa-text-gradient text-4xl">
          {t("messages.pageTitle")}
        </h1>

        <MessagesInbox standalone />
      </main>
    </div>
  );
}
