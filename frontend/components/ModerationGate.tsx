"use client";

import { useModeration } from "@/lib/useModeration";
import RestrictionDialog from "@/components/RestrictionDialog";

/* Mounted on every dashboard page (via DashHeader). Polls status so an admin's
   ban/mute reaches open tabs.

   Cookies/session are NEVER deleted here — a banned/muted account stays signed
   in so its record persists and it cannot simply be discarded. Instead both
   notices force a hard navigation to "/" (which now renders the public landing
   for restricted sessions).
   • ban  → "OK" (acknowledge) → landing.
   • mute → shown once; "browse the site" (acknowledge) → landing. The mute is
     remembered so the notice doesn't reappear; the user may still return to the
     dashboard where they can view their profile (actions stay disabled via
     MuteDisabled). Both can be appealed from the dialog. */
export default function ModerationGate() {
  const { status } = useModeration({ pollMs: 15000, onFocus: true });
  if (!status) return null;

  if (status.banned.active) {
    return (
      <RestrictionDialog
        kind="ban"
        restriction={status.banned}
        onAcknowledge={() => {
          // Keep the session (cookies) intact; just leave to the landing page.
          window.location.replace("/");
        }}
      />
    );
  }
  if (status.muted.active) {
    return (
      <RestrictionDialog
        kind="mute"
        restriction={status.muted}
        muteOnceKey={muteKey(status.muted)}
        onAcknowledge={() => {
          // Remember this mute so the notice doesn't reappear, then go to the
          // landing page ("browse the site"). Session/cookies are kept.
          try {
            localStorage.setItem("ackMute", muteKey(status.muted));
          } catch {}
          window.location.replace("/");
        }}
      />
    );
  }
  return null;
}

/* A stable key per mute instance (reason + until) so a new/changed mute shows
   the notice again, but the same one is only shown once. */
function muteKey(m: { reason: string | null; until: string | null }): string {
  return `${m.reason ?? ""}|${m.until ?? "perm"}`;
}

