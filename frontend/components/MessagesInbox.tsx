"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";

type Msg = {
  id: string;
  body: string;
  from: string | null;
  system?: boolean;
  read: boolean;
  createdAt: string;
};

/* User's inbox.
   • Admin direct messages (real people) are shown first.
   • System notifications (auto-generated receipts about decisions on the user)
     are separated into their own subsection so they never clutter real mail.
   • Default (embedded, on the profile): renders nothing unless there are ADMIN
     messages — system receipts live in the bell + the standalone page.
   • standalone (dedicated Messages page): always renders both, with empty
     states. */
export default function MessagesInbox({
  standalone = false,
}: {
  standalone?: boolean;
}) {
  const t = useT();
  const [messages, setMessages] = useState<Msg[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/messages");
    if (res.ok) setMessages((await res.json()).messages ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    await fetch("/api/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function markAllRead() {
    await fetch("/api/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    await load();
  }

  const anyUnread = messages.some((m) => !m.read);

  const admin = messages.filter((m) => !m.system);
  const system = messages.filter((m) => m.system);

  // Embedded on the profile: only surface when there is real admin mail.
  if (admin.length === 0 && !standalone) return null;

  const Row = ({ m }: { m: Msg }) => (
    <div
      className={`rounded-[var(--sa-r-sm)] border px-4 py-3 ${
        m.read
          ? "border-[var(--sa-line)] bg-[var(--sa-surface-0)]"
          : "border-[var(--sa-line)] bg-[var(--sa-surface-1)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-[var(--sa-text-quaternary)]">
          {t("messages.from")}:{" "}
          <span className="sa-mono text-[var(--sa-text-tertiary)]">
            {m.system ? t("messages.systemSender") : m.from}
          </span>
        </p>
        {!m.read && (
          <button
            type="button"
            onClick={() => markRead(m.id)}
            className="shrink-0 text-xs text-[var(--sa-text-quaternary)] transition-colors hover:text-[var(--sa-text-secondary)]"
          >
            {t("messages.markRead")}
          </button>
        )}
      </div>
      <p className="mt-1 whitespace-pre-line text-sm text-[var(--sa-text)]">
        {m.body}
      </p>
    </div>
  );

  return (
    <>
      <section className="sa-card mt-4 p-6 md:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="sa-eyebrow">{t("messages.inbox")}</p>
          {anyUnread && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-[var(--sa-text-quaternary)] transition-colors hover:text-[var(--sa-text-secondary)]"
            >
              {t("messages.markAllRead")}
            </button>
          )}
        </div>
        {admin.length === 0 ? (
          <p className="text-sm text-[var(--sa-text-tertiary)]">
            {t("messages.noneReceived")}
          </p>
        ) : (
          <div className="space-y-2">
            {admin.map((m) => (
              <Row key={m.id} m={m} />
            ))}
          </div>
        )}
      </section>

      {/* System notifications — shown on the standalone Messages page, or when
          embedded only if some exist (kept out of the way of real mail). */}
      {(standalone || system.length > 0) && (
        <section className="sa-card mt-4 p-6 md:p-7">
          <p className="sa-eyebrow mb-4">{t("messages.systemInbox")}</p>
          {system.length === 0 ? (
            <p className="text-sm text-[var(--sa-text-tertiary)]">
              {t("messages.noSystem")}
            </p>
          ) : (
            <div className="space-y-2">
              {system.map((m) => (
                <Row key={m.id} m={m} />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
