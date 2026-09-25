import { prisma } from "@/lib/prisma";

/* Live ban/mute status for a user, honouring expiry. A restriction with a null
   "until" is permanent; a past "until" has expired and no longer applies.
   Also folds in the admin-mute from Stage 4 (warnings) as a mute. */

export type Restriction = {
  active: boolean;
  permanent: boolean;
  reason: string | null;
  until: string | null;
};

export type ModerationStatus = {
  banned: Restriction;
  muted: Restriction;
};

type Fields = {
  bannedAt: Date | null;
  bannedUntil: Date | null;
  banReason: string | null;
  mutedAt: Date | null;
  mutedUntil: Date | null;
  muteReason: string | null;
  adminMutedUntil: Date | null;
  adminMuteReason: string | null;
};

function evaluate(
  at: Date | null,
  until: Date | null,
  reason: string | null
): Restriction {
  if (!at) return { active: false, permanent: false, reason: null, until: null };
  if (until && until.getTime() <= Date.now()) {
    return { active: false, permanent: false, reason: null, until: null };
  }
  return {
    active: true,
    permanent: until === null,
    reason: reason ?? null,
    until: until ? until.toISOString() : null,
  };
}

export function computeStatus(u: Fields): ModerationStatus {
  const banned = evaluate(u.bannedAt, u.bannedUntil, u.banReason);
  let muted = evaluate(u.mutedAt, u.mutedUntil, u.muteReason);

  // Admin-mute (warnings) acts as a mute too, if not already muted harder.
  if (!muted.active && u.adminMutedUntil) {
    muted = evaluate(u.adminMutedUntil, u.adminMutedUntil, u.adminMuteReason);
    // adminMutedUntil is always timed (never permanent).
    if (u.adminMutedUntil.getTime() > Date.now()) {
      muted = {
        active: true,
        permanent: false,
        reason: u.adminMuteReason ?? null,
        until: u.adminMutedUntil.toISOString(),
      };
    }
  }

  return { banned, muted };
}

const SELECT = {
  bannedAt: true,
  bannedUntil: true,
  banReason: true,
  mutedAt: true,
  mutedUntil: true,
  muteReason: true,
  adminMutedUntil: true,
  adminMuteReason: true,
} as const;

export async function getModerationStatus(
  userId: string
): Promise<ModerationStatus | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: SELECT });
  if (!u) return null;
  return computeStatus(u);
}

/** True if the user is currently banned OR muted (either blocks write actions). */
export async function isRestricted(userId: string): Promise<boolean> {
  const s = await getModerationStatus(userId);
  if (!s) return false;
  return s.banned.active || s.muted.active;
}

/* Whether the user may manage their own account (revoke their API key or delete
   their account). Blocked when:
     • currently muted, OR
     • currently banned, OR
     • EVER banned (the permanent `wasBanned` mark — stays blocked even after the
       ban is lifted/expires).
   Returns a reason code for the caller to surface, or null if allowed. */
export async function selfManageBlockReason(
  userId: string
): Promise<"muted" | "banned" | "was_banned" | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...SELECT, wasBanned: true },
  });
  if (!u) return null;
  const s = computeStatus(u);
  if (s.banned.active) return "banned";
  if (u.wasBanned) return "was_banned";
  if (s.muted.active) return "muted";
  return null;
}
