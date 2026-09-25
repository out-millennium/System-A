"use client";

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";

type Item = {
  id: string;
  body: string;
  status: string;
  createdAt: string;
  reviewNote: string | null;
};

/* Admin UI for system announcements.
   • Every admin can compose (goes to "pending").
   • level >= 2 sees a review queue with Approve / Reject. */
export default function AnnouncementsManager({ level }: { level: number }) {
  const t = useT();
  const [own, setOwn] = useState<Item[]>([]);
  const [pending, setPending] = useState<Item[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/announcements");
    if (res.ok) {
      const d = await res.json();
      setOwn(d.own ?? []);
      setPending(d.pending ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!body.trim()) {
      setError(t("announcements.bodyRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        setBody("");
        await load();
      } else {
        setError(t("announcements.error"));
      }
    } catch {
      setError(t("announcements.error"));
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, action: "approve" | "reject") {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, note: notes[id] ?? "" }),
      });
      if (res.ok) await load();
      else setError(t("announcements.error"));
    } catch {
      setError(t("announcements.error"));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = (s: string) =>
    s === "approved"
      ? t("announcements.statusApproved")
      : s === "rejected"
        ? t("announcements.statusRejected")
        : t("announcements.statusPending");

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-2">{t("announcements.title")}</p>
      <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
        {level >= 2 ? t("announcements.leadSelf") : t("announcements.lead")}
      </p>

      {/* Compose */}
      <form onSubmit={submit} className="space-y-3">
        <textarea
          className="sa-textarea w-full"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("announcements.placeholder")}
        />
        {error && <p className="text-sm text-[var(--sa-danger)]">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="sa-btn sa-btn-primary"
        >
          {busy
            ? t("announcements.submitting")
            : level >= 2
              ? t("announcements.publish")
              : t("announcements.submit")}
        </button>
      </form>

      {/* Review queue (level >= 2) */}
      {level >= 2 && (
        <div className="mt-8">
          <p className="sa-eyebrow mb-3">{t("announcements.pendingReview")}</p>
          {pending.length === 0 ? (
            <p className="text-sm text-[var(--sa-text-tertiary)]">
              {t("announcements.noPending")}
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((a) => (
                <div
                  key={a.id}
                  className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-4"
                >
                  <p className="text-sm text-[var(--sa-text)]">{a.body}</p>
                  <input
                    className="sa-input mt-3 text-xs"
                    placeholder={t("announcements.reviewNote")}
                    value={notes[a.id] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [a.id]: e.target.value }))
                    }
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => review(a.id, "approve")}
                      className="sa-btn sa-btn-primary !py-1.5 text-xs"
                    >
                      {t("announcements.approve")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => review(a.id, "reject")}
                      className="sa-btn sa-btn-ghost !py-1.5 text-xs text-[var(--sa-danger)]"
                    >
                      {t("announcements.reject")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Own messages */}
      <div className="mt-8">
        <p className="sa-eyebrow mb-3">{t("announcements.yourMessages")}</p>
        {own.length === 0 ? (
          <p className="text-sm text-[var(--sa-text-tertiary)]">
            {t("announcements.empty")}
          </p>
        ) : (
          <div className="space-y-2">
            {own.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-3 rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3"
              >
                <p className="text-sm text-[var(--sa-text-secondary)]">
                  {a.body}
                  {a.reviewNote && (
                    <span className="mt-1 block text-xs text-[var(--sa-text-quaternary)]">
                      — {a.reviewNote}
                    </span>
                  )}
                </p>
                <span
                  className={`shrink-0 text-xs ${
                    a.status === "approved"
                      ? "text-[var(--sa-ok)]"
                      : a.status === "rejected"
                        ? "text-[var(--sa-danger)]"
                        : "text-[var(--sa-text-quaternary)]"
                  }`}
                >
                  {statusLabel(a.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
