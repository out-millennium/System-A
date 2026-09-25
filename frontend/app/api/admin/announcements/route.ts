import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdmin, getActiveAdmin } from "@/lib/admin";
import { boundedText, MAX_BODY } from "@/lib/text";

/* Admin announcements.
   GET   — level 1: own announcements; level >=2: own + all pending to review.
   POST  — any admin creates a pending announcement { body }.
   PATCH — level >=2 approves/rejects { id, action: "approve"|"reject", note }. */

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const own = await prisma.announcement.findMany({
    where: { authorId: admin.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  let pending: typeof own = [];
  if (admin.level >= 2) {
    pending = await prisma.announcement.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  }

  return NextResponse.json({
    level: admin.level,
    own: own.map(serialize),
    pending: pending.map(serialize),
  });
}

export async function POST(req: NextRequest) {
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { body } = await req.json().catch(() => ({}));
  const text = boundedText(body, MAX_BODY); // trimmed + capped
  if (!text) {
    return NextResponse.json({ error: "body_required" }, { status: 400 });
  }

  // Admins who can moderate (level >= 2) publish immediately; level 1 goes to
  // the review queue for a higher admin to approve.
  const selfApprove = admin.level >= 2;
  const a = await prisma.announcement.create({
    data: {
      authorId: admin.id,
      body: text,
      status: selfApprove ? "approved" : "pending",
      ...(selfApprove
        ? { reviewerId: admin.id, reviewedAt: new Date() }
        : {}),
    },
  });
  return NextResponse.json({ ok: true, id: a.id, published: selfApprove });
}

export async function PATCH(req: NextRequest) {
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (admin.level < 2) {
    return NextResponse.json({ error: "level_too_low" }, { status: 403 });
  }

  const { id, action, note } = await req.json().catch(() => ({}));
  if (!id || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.announcement.update({
    where: { id },
    data: {
      status: action === "approve" ? "approved" : "rejected",
      reviewerId: admin.id,
      reviewNote: typeof note === "string" ? note.trim() || null : null,
      reviewedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}

function serialize(a: {
  id: string;
  body: string;
  status: string;
  createdAt: Date;
  reviewNote: string | null;
}) {
  return {
    id: a.id,
    body: a.body,
    status: a.status,
    createdAt: a.createdAt,
    reviewNote: a.reviewNote,
  };
}
