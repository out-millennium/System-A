import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdmin, getActiveAdmin } from "@/lib/admin";
import { canReviewAppeal as canReview } from "@/lib/tiers";
import { sendMail } from "@/lib/mail";
import { boundedText } from "@/lib/text";

/* Review appeals against ban/mute. An appeal is handled by an admin strictly
   above the actor's level, WITH one exception: a punishment issued by a level-4
   admin may also be handled by ANOTHER level-4 admin (not the issuer). This
   keeps level-4 punishments reviewable even without going all the way to the
   creator, while never letting an admin review their own action.
   GET   — open appeals this admin may review.
   PATCH { id, action: "uphold"|"dismiss" } — uphold lifts the restriction. */



export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (admin.level < 4) {
    return NextResponse.json({ error: "level_too_low" }, { status: 403 });
  }

  const appeals = await prisma.moderationAppeal.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      filer: { select: { accountName: true, email: true } },
      action: {
        select: {
          action: true,
          reason: true,
          actorId: true,
          actor: { select: { adminLevel: true, accountName: true } },
        },
      },
    },
  });

  // Appeals this admin may review (strictly above the punisher, or a peer
  // level-4 review of a level-4 punishment — never one's own action).
  const visible = appeals.filter((a) =>
    canReview(
      admin.level,
      admin.id,
      a.action.actor.adminLevel ?? 0,
      a.action.actorId
    )
  );

  return NextResponse.json({
    appeals: visible.map((a) => ({
      id: a.id,
      reason: a.reason,
      by: a.filer.accountName ?? a.filer.email,
      kind: a.action.action,
      punishmentReason: a.action.reason,
      actor: a.action.actor.accountName,
      createdAt: a.createdAt,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (admin.level < 4) {
    return NextResponse.json({ error: "level_too_low" }, { status: 403 });
  }

  const { id, action, reviewNote } = await req.json().catch(() => ({}));
  if (!id || !["uphold", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const appeal = await prisma.moderationAppeal.findUnique({
    where: { id },
    include: {
      action: { include: { actor: true } },
      filer: { select: { email: true } },
    },
  });
  if (!appeal || appeal.status !== "open") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Must be allowed to review this action (above the punisher, or peer level-4,
  // never one's own).
  if (
    !canReview(
      admin.level,
      admin.id,
      appeal.action.actor.adminLevel ?? 0,
      appeal.action.actorId
    )
  ) {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  // On dismissal, an optional reason is recorded for the appellant to see.
  const note = action === "dismiss" ? boundedText(reviewNote) || null : null;
  await prisma.moderationAppeal.update({
    where: { id },
    data: {
      status: action === "uphold" ? "upheld" : "dismissed",
      reviewNote: note,
      resolvedAt: new Date(),
    },
  });

  // Upholding lifts the corresponding restriction on the target.
  if (action === "uphold") {
    const kind = appeal.action.action; // ban | mute
    const targetId = appeal.action.targetId;
    if (kind === "ban") {
      await prisma.user.update({
        where: { id: targetId },
        data: { bannedAt: null, bannedUntil: null, banReason: null },
      });
    } else if (kind === "mute") {
      await prisma.user.update({
        where: { id: targetId },
        data: { mutedAt: null, mutedUntil: null, muteReason: null },
      });
    }
  }

  // Email the appellant the outcome (best-effort; only sent when SMTP is set).
  try {
    if (appeal.filer.email) {
      await sendMail({
        to: appeal.filer.email,
        subject: "System A — appeal decision",
        text:
          action === "uphold"
            ? "Your appeal was upheld and the restriction has been lifted."
            : `Your appeal was reviewed and dismissed.${
                note ? `\n\nReason: ${note}` : ""
              }`,
      });
    }
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
