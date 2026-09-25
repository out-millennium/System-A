import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdmin, getActiveAdmin } from "@/lib/admin";
import { boundedText } from "@/lib/text";

/* Admin warnings (Stage 4). Level >= 3.
   POST { target, reason, hours? } — warn a LOWER-level admin.
     • The 3rd active warning mutes the target; the issuer must supply `hours`
       (1..720 = up to one month) for that mute.
     • Once muted by 3 warnings, no further warnings can be issued.
     • The auto-mute is recorded as a ModerationAction so the target can appeal
       it through the normal ban/mute appeal flow.
   GET  — warnings I received (with the latest one's id for appeal) + issued. */

const MONTH_HOURS = 720;

export async function POST(req: NextRequest) {
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (admin.level < 3) {
    return NextResponse.json({ error: "level_too_low" }, { status: 403 });
  }

  const { target, reason, hours } = await req.json().catch(() => ({}));
  const targetName = typeof target === "string" ? target.trim() : "";
  const text = boundedText(reason); // trimmed + capped
  if (!targetName) {
    return NextResponse.json({ error: "target_required" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findFirst({
    where: { OR: [{ accountName: targetName }, { email: targetName }] },
    select: { id: true, role: true, adminLevel: true, adminMutedUntil: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  // Never warn yourself.
  if (targetUser.id === admin.id) {
    return NextResponse.json({ error: "cannot_self" }, { status: 403 });
  }
  // A warning may target a REGULAR user, or a STRICTLY LOWER-level admin.
  // (Regular users have no adminLevel; admins at >= the issuer's level are
  // off-limits.)
  const targetIsAdmin = targetUser.role === "admin" && !!targetUser.adminLevel;
  if (targetIsAdmin && (targetUser.adminLevel ?? 0) >= admin.level) {
    return NextResponse.json({ error: "not_lower" }, { status: 403 });
  }

  // Once the warnings-mute has expired, the slate is wiped: the previous three
  // warnings are auto-revoked so the admin can start receiving warnings again.
  if (
    targetUser.adminMutedUntil &&
    targetUser.adminMutedUntil.getTime() <= Date.now()
  ) {
    await prisma.warning.updateMany({
      where: { targetId: targetUser.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.user.update({
      where: { id: targetUser.id },
      data: { adminMutedUntil: null, adminMuteReason: null },
    });
  }

  // How many active warnings the target already has.
  const existing = await prisma.warning.count({
    where: { targetId: targetUser.id, revokedAt: null },
  });

  // Once the muting (3rd) warning has landed, no more warnings are allowed.
  if (existing >= 3) {
    return NextResponse.json({ error: "already_capped" }, { status: 400 });
  }

  // The third warning mutes the target — the issuer must set the duration.
  const isThird = existing === 2;
  let until: Date | null = null;
  if (isThird) {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) {
      return NextResponse.json({ error: "hours_required" }, { status: 400 });
    }
    if (h > MONTH_HOURS) {
      return NextResponse.json({ error: "hours_too_long" }, { status: 400 });
    }
    until = new Date(Date.now() + h * 60 * 60 * 1000);
  }

  await prisma.warning.create({
    data: { issuerId: admin.id, targetId: targetUser.id, reason: text },
  });

  let muted = false;
  if (isThird && until) {
    // Apply the mute and log a ModerationAction so it can be appealed like any
    // other ban/mute (the actor is the warning issuer).
    await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        mutedAt: new Date(),
        mutedUntil: until,
        muteReason: text,
        // Keep the warnings-mute markers in sync for status computation.
        adminMutedUntil: until,
        adminMuteReason: text,
      },
    });
    await prisma.moderationAction.create({
      data: {
        actorId: admin.id,
        targetId: targetUser.id,
        action: "mute",
        reason: text,
        until,
      },
    });
    muted = true;
  }

  return NextResponse.json({ ok: true, activeCount: existing + 1, muted });
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const received = await prisma.warning.findMany({
    where: { targetId: admin.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      issuer: { select: { accountName: true } },
      complaints: { select: { id: true, status: true } },
    },
  });

  const issued =
    admin.level >= 3
      ? await prisma.warning.findMany({
          where: { issuerId: admin.id },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { target: { select: { accountName: true } } },
        })
      : [];

  return NextResponse.json({
    level: admin.level,
    received: received.map((w) => ({
      id: w.id,
      reason: w.reason,
      from: w.issuer.accountName,
      revoked: w.revokedAt !== null,
      createdAt: w.createdAt,
      hasComplaint: w.complaints.length > 0,
    })),
    issued: issued.map((w) => ({
      id: w.id,
      reason: w.reason,
      to: w.target.accountName,
      revoked: w.revokedAt !== null,
      createdAt: w.createdAt,
    })),
  });
}
