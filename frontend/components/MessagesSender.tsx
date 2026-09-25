"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import AccountPreview from "@/components/AccountPreview";

type Sent = { id: string; body: string; to: string | null; createdAt: string };

/* Admin (level >= 2) UI to send a direct message to a user + list sent ones. */
export default function MessagesSender() {
  const t = useT();
  const { toast } = useToast();
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/messages");
    if (res.ok) setSent((await res.json()).sent ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!recipient.trim()) return setError(t("messages.recipientRequired"));
    if (!body.trim()) return setError(t("messages.bodyRequired"));
    setBusy(true);
    const res = await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient, body }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setBody("");
      setRecipient("");
      await load();
      toast(t("notif.messageSent"), "success");
    } else if (d.error === "user_not_found") {
      setError(t("messages.userNotFound"));
    } else {
      setError(t("messages.error"));
    }
  }

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-2">{t("messages.title")}</p>
      <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
        {t("messages.adminLead")}
      </p>

      <form onSubmit={submit} className="space-y-3">
        <input
          className="sa-input"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder={t("messages.recipient")}
        />
        <AccountPreview identifier={recipient} />
        <textarea
          className="sa-textarea w-full"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("messages.placeholder")}
        />
        {error && <p className="text-sm text-[var(--sa-danger)]">{error}</p>}
        <button type="submit" disabled={busy} className="sa-btn sa-btn-primary">
          {busy ? t("messages.sending") : t("messages.send")}
        </button>
      </form>

      <div className="mt-8">
        <p className="sa-eyebrow mb-3">{t("messages.sent")}</p>
        {sent.length === 0 ? (
          <p className="text-sm text-[var(--sa-text-tertiary)]">
            {t("messages.noSent")}
          </p>
        ) : (
          <div className="space-y-2">
            {sent.map((m) => (
              <div
                key={m.id}
                className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3"
              >
                <p className="text-xs text-[var(--sa-text-quaternary)]">
                  {t("messages.to")}:{" "}
                  <span className="sa-mono text-[var(--sa-text-tertiary)]">
                    {m.to}
                  </span>
                </p>
                <p className="mt-1 text-sm text-[var(--sa-text-secondary)]">
                  {m.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
