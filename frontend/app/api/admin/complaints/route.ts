import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdmin, getActiveAdmin } from "@/lib/admin";
import { boundedText } from "@/lib/text";

/* Complaints/appeals about warnings (Stage 4).
   POST { warningId, reason } — any admin appeals a warning issued TO THEM
     (allowed even while admin-muted). Reason required.
   GET  — level >= 4: open complaints to review.
   PATCH { id, action: "uphold"|"dismiss" } — level >= 4 resolves. Upholding
     revokes the warning and re-evaluates the target's auto-mute. */

async function reevaluateMute(userId: string) {
  const active = await prisma.warning.count({
    where: { targetId: userId, revokedAt: null },
  });
  if (active < 3) {
    // Lift the warnings-based mute once below the threshold.
    await prisma.user.update({
      where: { id: userId },
      data: { adminMutedUntil: null, adminMuteReason: null },
    });
  }
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id as string | undefined;
  const filerId = admin?.id ?? sessionUserId;
  if (!filerId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { warningId, reason } = await req.json().catch(() => ({}));
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!warningId) {
    return NextResponse.json({ error: "warning_required" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const warning = await prisma.warning.findUnique({ where: { id: warningId } });
  // Can only appeal a warning that targets you.
  if (!warning || warning.targetId !== filerId) {
    return NextResponse.json({ error: "not_your_warning" }, { status: 403 });
  }

  // Avoid duplicate open complaints for the same warning.
  const dup = await prisma.complaint.findFirst({
    where: { warningId, filerId, status: "open" },
  });
  if (dup) {
    return NextResponse.json({ error: "already_filed" }, { status: 400 });
  }

  await prisma.complaint.create({
    data: { warningId, filerId, reason: text },
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Warning appeals are handled by level 4 (the creator, level 5, only reviews
  // permanent-ban appeals). This keeps escalation tiers distinct.
  if (admin.level !== 4) {
    return NextResponse.json({ error: "wrong_tier" }, { status: 403 });
  }

  const complaints = await prisma.complaint.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      filer: { select: { accountName: true } },
      warning: { select: { reason: true } },
    },
  });

  return NextResponse.json({
    complaints: complaints.map((c) => ({
      id: c.id,
      reason: c.reason,
      by: c.filer.accountName,
      warningReason: c.warning.reason,
      createdAt: c.createdAt,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Warning appeals are handled by level 4 (the creator, level 5, only reviews
  // permanent-ban appeals). This keeps escalation tiers distinct.
  if (admin.level !== 4) {
    return NextResponse.json({ error: "wrong_tier" }, { status: 403 });
  }

  const { id, action, reviewNote } = await req.json().catch(() => ({}));
  if (!id || !["uphold", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const complaint = await prisma.complaint.findUnique({
    where: { id },
    include: { warning: true },
  });
  if (!complaint || complaint.status !== "open") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Optional reason recorded on dismissal for the appellant to see.
  const note = action === "dismiss" ? boundedText(reviewNote) || null : null;
  await prisma.complaint.update({
    where: { id },
    data: {
      status: action === "uphold" ? "upheld" : "dismissed",
      reviewNote: note,
      resolvedAt: new Date(),
    },
  });

  if (action === "uphold") {
    // Revoke the warning and lift the mute if now below threshold.
    await prisma.warning.update({
      where: { id: complaint.warningId },
      data: { revokedAt: new Date() },
    });
    await reevaluateMute(complaint.warning.targetId);
  }

  return NextResponse.json({ ok: true });
}
