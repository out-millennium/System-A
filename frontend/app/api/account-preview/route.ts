import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdmin } from "@/lib/admin";
import { computeStatus } from "@/lib/moderation";

/* Account-state preview for any signed-in user, powering the little "who is
   this?" cards under name/email input fields.

   Privacy tiers:
     • Regular users get only: exists + display name (enough to confirm a
       transfer recipient without leaking moderation state).
     • Admins additionally get: role/level, live ban/mute status, and — for the
       warnings flow — the target's active-warning count and whether the NEXT
       warning would be the third (muting) one.

   GET ?identifier=<accountName|email> */

const MOD_SELECT = {
  bannedAt: true,
  bannedUntil: true,
  banReason: true,
  mutedAt: true,
  mutedUntil: true,
  muteReason: true,
  adminMutedUntil: true,
  adminMuteReason: true,
} as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const viewerId = session?.user?.id as string | undefined;
  if (!viewerId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const identifier = (req.nextUrl.searchParams.get("identifier") || "").trim();
  if (!identifier) {
    return NextResponse.json({ found: false });
  }

  const admin = await getAdmin();

  const target = await prisma.user.findFirst({
    where: { OR: [{ accountName: identifier }, { email: identifier }] },
    select: {
      id: true,
      accountName: true,
      role: true,
      adminLevel: true,
      ...MOD_SELECT,
    },
  });

  if (!target) {
    return NextResponse.json({ found: false });
  }

  // Base payload for everyone: existence + display name.
  const base = {
    found: true as const,
    accountName: target.accountName,
    isSelf: target.id === viewerId,
  };

  // Regular users stop here (no moderation/role disclosure).
  if (!admin) {
    return NextResponse.json(base);
  }

  const status = computeStatus(target);

  // Active-warning count is only meaningful to warning-issuers (level >= 3) and
  // only for strictly lower-level admin targets.
  let activeWarnings: number | null = null;
  let nextIsThird = false;
  // Warnings may target a regular user OR a strictly lower-level admin.
  const targetIsRegular = !(target.role === "admin" && target.adminLevel != null);
  const targetIsLowerAdmin =
    target.role === "admin" &&
    target.adminLevel != null &&
    target.adminLevel < admin.level;
  const warnable =
    target.id !== admin.id && (targetIsRegular || targetIsLowerAdmin);
  if (admin.level >= 3 && warnable) {
    // Mirror the POST logic: an expired warnings-mute wipes the slate, so a
    // preview should reflect a fresh (0) count in that case.
    const muteExpired =
      target.adminMutedUntil != null &&
      target.adminMutedUntil.getTime() <= Date.now();
    activeWarnings = muteExpired
      ? 0
      : await prisma.warning.count({
          where: { targetId: target.id, revokedAt: null },
        });
    nextIsThird = activeWarnings === 2;
  }

  return NextResponse.json({
    ...base,
    isAdmin: target.role === "admin",
    adminLevel: target.adminLevel,
    status,
    activeWarnings,
    nextIsThird,
    // Whether this admin may act on the target at all (strictly lower or a
    // regular user, and not self).
    canModerate:
      target.id !== admin.id &&
      !(
        target.role === "admin" &&
        target.adminLevel != null &&
        target.adminLevel >= admin.level
      ),
  });
}
