import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdmin, getActiveAdmin } from "@/lib/admin";
import { canReviewRequest as canReview } from "@/lib/tiers";
import { boundedText } from "@/lib/text";

/* Review admin API-key revocation requests.
   Tier rule: a request from a level-<4 admin is handled by level 4; a request
   from a level-4 admin is handled by the creator (level 5).
   GET   — open requests this admin may review.
   PATCH { id, action: "approve"|"reject" } — approve revokes the key. */

const CORE_API_URL = process.env.CORE_API_URL!;
const CORE_ADMIN_KEY = process.env.CORE_ADMIN_KEY!;

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (admin.level < 4) {
    return NextResponse.json({ error: "level_too_low" }, { status: 403 });
  }

  const reqs = await prisma.apiKeyRevocationRequest.findMany({
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

  const request = await prisma.apiKeyRevocationRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { id: true, adminLevel: true, apiKey: true } },
    },
  });
  if (!request || request.status !== "open") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Defense-in-depth: the creator's key can never be revoked via a stale request.
  if ((request.requester.adminLevel ?? 0) >= 5) {
    return NextResponse.json({ error: "cannot_creator" }, { status: 403 });
  }
  if (!canReview(admin.level, request.requester.adminLevel ?? 0)) {
    return NextResponse.json({ error: "wrong_tier" }, { status: 403 });
  }

  if (action === "reject") {
    const note = boundedText(reviewNote) || null;
    await prisma.apiKeyRevocationRequest.update({
      where: { id },
      data: { status: "rejected", reviewNote: note, resolvedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // Approve: revoke the requester's Core API key, then clear it locally.
  if (request.requester.apiKey) {
    const res = await fetch(`${CORE_API_URL}/account/api_key`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": CORE_ADMIN_KEY,
      },
      body: JSON.stringify({ api_key: request.requester.apiKey }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: d.detail || "revoke_failed" },
        { status: 400 }
      );
    }
    await prisma.user.update({
      where: { id: request.requester.id },
      data: { apiKey: null },
    });
  }

  await prisma.apiKeyRevocationRequest.update({
    where: { id },
    data: { status: "approved", resolvedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
