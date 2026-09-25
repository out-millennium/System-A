import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdmin, getActiveAdmin } from "@/lib/admin";
import { generateAdminName } from "@/lib/adminName";
import { boundedText } from "@/lib/text";

/* Review admin applications. Level >= 4.
   GET   — open applications.
   PATCH — { id, action: "approve"|"reject", level } resolves an application.
     Approving promotes the applicant to admin at `level` and renames the
     account to "admin####". Level 4 reviewers may grant 1..3; the creator
     (level 5) may grant 1..4. */

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (admin.level < 4) {
    return NextResponse.json({ error: "level_too_low" }, { status: 403 });
  }

  const apps = await prisma.adminApplication.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { applicant: { select: { accountName: true, email: true } } },
  });

  return NextResponse.json({
    reviewerLevel: admin.level,
    applications: apps.map((a) => ({
      id: a.id,
      reason: a.reason,
      requestedLevel: a.requestedLevel,
      applicant: a.applicant.accountName ?? a.applicant.email,
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

  const { id, action, level, reviewNote } = await req.json().catch(() => ({}));
  if (!id || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const app = await prisma.adminApplication.findUnique({ where: { id } });
  if (!app || app.status !== "open") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (action === "reject") {
    // Optional reason the applicant will see in their profile feed.
    const note = boundedText(reviewNote) || null;
    await prisma.adminApplication.update({
      where: { id },
      data: { status: "rejected", reviewNote: note, resolvedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // Approve: validate the grantable level for this reviewer.
  const grant = Number(level);
  const maxGrant = admin.level >= 5 ? 4 : 3; // level 4 may grant up to 3
  if (![1, 2, 3, 4].includes(grant) || grant > maxGrant) {
    return NextResponse.json({ error: "level_not_allowed" }, { status: 403 });
  }

  const adminName = await generateAdminName();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: app.applicantId },
      data: { role: "admin", adminLevel: grant, accountName: adminName },
    }),
    prisma.adminApplication.update({
      where: { id },
      data: { status: "approved", resolvedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true, accountName: adminName });
}
