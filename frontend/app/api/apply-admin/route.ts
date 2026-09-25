import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { boundedText } from "@/lib/text";

/* Submit an admin application. Only a signed-in, onboarded, non-admin user may
   apply. Body: { reason, requestedLevel: 1..4 }. One open application at a time.
   GET returns the caller's latest application status. */

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, adminLevel: true, createdAt: true },
  });
  const activityCount = await prisma.securityEvent.count({ where: { userId } });
  const eligibleAt = me?.createdAt ? new Date(me.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null;
  const eligible = Boolean(me && eligibleAt && Date.now() >= eligibleAt.getTime() && activityCount > 0);
  const latest = await prisma.adminApplication.findFirst({
    where: { applicantId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      requestedLevel: true,
      reviewNote: true,
      createdAt: true,
    },
  });
  return NextResponse.json({
    isAdmin: me?.role === "admin",
    adminLevel: (me as { adminLevel?: number | null })?.adminLevel ?? null,
    eligible,
    accountCreatedAt: me?.createdAt ?? null,
    eligibleAt,
    activityCount,
    application: latest,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, onboarded: true, createdAt: true },
  });
  if (!me || !me.onboarded) {
    return NextResponse.json({ error: "not_onboarded" }, { status: 403 });
  }
  if (me.role === "admin") {
    return NextResponse.json({ error: "already_admin" }, { status: 400 });
  }

  const activityCount = await prisma.securityEvent.count({ where: { userId } });
  const eligibleAt = new Date(me.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (Date.now() < eligibleAt.getTime()) {
    return NextResponse.json({ error: "account_too_new", eligibleAt }, { status: 403 });
  }
  if (activityCount < 1) {
    return NextResponse.json({ error: "no_activity" }, { status: 403 });
  }

  const { reason, requestedLevel } = await req.json().catch(() => ({}));
  const text = boundedText(reason); // trimmed + hard-capped (anti-abuse)
  const lvl = Number(requestedLevel);
  if (!text) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }
  if (![1, 2, 3, 4].includes(lvl)) {
    return NextResponse.json({ error: "invalid_level" }, { status: 400 });
  }

  // Prevent stacking multiple open applications.
  const open = await prisma.adminApplication.findFirst({
    where: { applicantId: userId, status: "open" },
  });
  if (open) {
    return NextResponse.json({ error: "already_open" }, { status: 400 });
  }

  await prisma.adminApplication.create({
    data: { applicantId: userId, reason: text, requestedLevel: lvl },
  });
  return NextResponse.json({ ok: true });
}

/* Withdraw the caller's own OPEN application. Only the applicant can withdraw,
   and only while it is still open (not yet approved/rejected). */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const open = await prisma.adminApplication.findFirst({
    where: { applicantId: userId, status: "open" },
    orderBy: { createdAt: "desc" },
  });
  if (!open) {
    return NextResponse.json({ error: "no_open_application" }, { status: 404 });
  }
  await prisma.adminApplication.update({
    where: { id: open.id },
    data: { status: "withdrawn", resolvedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
