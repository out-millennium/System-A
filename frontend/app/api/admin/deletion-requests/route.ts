import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdmin, getActiveAdmin } from "@/lib/admin";
import { canReviewRequest as canReview } from "@/lib/tiers";
import { boundedText } from "@/lib/text";

/* Review admin account-deletion requests.
   Tier rule: a request from a level-<4 admin is handled by level 4; a request
   from a level-4 admin is handled by the creator (level 5).
   GET   — open requests this admin may review.
   PATCH { id, action: "approve"|"reject" } — approve deletes the account. */

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (admin.level < 4) {
    return NextResponse.json({ error: "level_too_low" }, { status: 403 });
  }

  const reqs = await prisma.accountDeletionRequest.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      requester: { select: { accountName: true, email: true, adminLevel: true } },
    },
  });

  const visible = reqs.filter((r) =>
    canReview(admin.level, r.requester.adminLevel ?? 0)
  );

  return NextResponse.json({
    requests: visible.map((r) => ({
      id: r.id,
      reason: r.reason,
      by: r.requester.accountName ?? r.requester.email,
      level: r.requester.adminLevel,
      createdAt: r.createdAt,
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
  if (!id || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const request = await prisma.accountDeletionRequest.findUnique({
    where: { id },
    include: { requester: { select: { id: true, adminLevel: true } } },
  });
  if (!request || request.status !== "open") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Defense-in-depth: the creator can never be deleted, even via a stale request.
  if ((request.requester.adminLevel ?? 0) >= 5) {
    return NextResponse.json({ error: "cannot_creator" }, { status: 403 });
  }
  if (!canReview(admin.level, request.requester.adminLevel ?? 0)) {
    return NextResponse.json({ error: "wrong_tier" }, { status: 403 });
  }

  if (action === "reject") {
    const note = boundedText(reviewNote) || null;
    await prisma.accountDeletionRequest.update({
      where: { id },
      data: { status: "rejected", reviewNote: note, resolvedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // Approve: mark resolved, then delete the requester's account (cascades).
  await prisma.accountDeletionRequest.update({
    where: { id },
    data: { status: "approved", resolvedAt: new Date() },
  });
  await prisma.user.delete({ where: { id: request.requester.id } });
  return NextResponse.json({ ok: true });
}
