import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveAdmin, getAdmin } from "@/lib/admin";
import { boundedText } from "@/lib/text";

export async function GET() {
  const admin = await getAdmin();
  if (!admin || admin.level < 4) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const complaints = await prisma.supportMessageComplaint.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      filer: { select: { accountName: true } },
      message: {
        select: {
          body: true,
          kind: true,
          author: { select: { accountName: true } },
          ticket: { select: { id: true, user: { select: { accountName: true } } } },
        },
      },
    },
  });
  return NextResponse.json({ complaints });
}

export async function PATCH(req: NextRequest) {
  const admin = await getActiveAdmin();
  if (!admin || admin.level < 4) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id, action, reviewNote } = await req.json().catch(() => ({}));
  if (!id || !["uphold", "dismiss"].includes(action)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const complaint = await prisma.supportMessageComplaint.findUnique({ where: { id } });
  if (!complaint || complaint.status !== "open") return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.supportMessageComplaint.update({
    where: { id },
    data: {
      reviewerId: admin.id,
      status: action === "uphold" ? "upheld" : "dismissed",
      reviewNote: boundedText(reviewNote) || null,
      resolvedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}
