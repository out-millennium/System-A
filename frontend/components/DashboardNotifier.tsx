"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import MessagesNotice from "@/components/MessagesNotice";
import { playNotify } from "@/lib/sound";

/* On dashboard entry:
   • newly approved system announcements → site-style toasts,
   • incoming moderation decisions (warnings/bans/mutes received, and terminal
     decisions on the user's appeals/applications/requests) → site-style toasts
     that are CLICKABLE (jump to the item in the profile). The server also
     records each as a system message in the inbox, already read, so it lives in
     history without bumping the unread badge. Each is shown exactly once
     (server-side dedupe by refId → only fresh ones come back).
   • unread direct messages → a site-style modal notice (MessagesNotice). */
export default function DashboardNotifier() {
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let notificationSoundPlayed = false;

    // System announcements → toast once per announcement id.
    fetch("/api/announcements")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.announcements) return;
        let seen: string[] = [];
        try {
          seen = JSON.parse(localStorage.getItem("seenAnnouncements") || "[]");
        } catch {}
        const fresh = d.announcements.filter(
          (a: { id: string }) => !seen.includes(a.id)
        );
        fresh.forEach((a: { body: string }) => toast(a.body, "success", { sound: false }));
        if (fresh.length) {
          notificationSoundPlayed = true;
          void playNotify();
        }
        if (fresh.length) {
          const ids = d.announcements.map((a: { id: string }) => a.id);
          try {
            localStorage.setItem("seenAnnouncements", JSON.stringify(ids));
          } catch {}
        }
      })
      .catch(() => {});

    // Incoming decisions → create receipts (already-read inbox messages) and
    // toast only the freshly-created ones. Clicking a toast opens the item.
    fetch("/api/auth/notifications", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.notifications) return;
        const list = d.notifications as {
          id: string;
          body: string;
          href: string;
          positive: boolean;
        }[];
        // New notifications on entry → cheerful jingle (gated by the sound +
        // notification-sound toggles). Fire once for the whole batch.
        if (list.length > 0 && !notificationSoundPlayed) {
          notificationSoundPlayed = true;
          void playNotify();
        }
        for (const n of list) {
          // Toast shows the first line (title); the full text is in the inbox.
          const title = n.body.split("\n")[0];
          toast(title, n.positive ? "success" : "error", {
            sound: false,
            onAction: () => router.push(n.href),
          });
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [toast, router]);

  // Unread direct messages (from admins) still surface as a modal notice.
  return <MessagesNotice />;
}
