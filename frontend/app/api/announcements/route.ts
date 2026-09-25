import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* Public feed of approved system announcements — visible to everyone. */
export async function GET() {
  const items = await prisma.announcement.findMany({
    where: { status: "approved" },
    orderBy: { reviewedAt: "desc" },
    take: 20,
    select: { id: true, body: true, reviewedAt: true },
  });
  return NextResponse.json({ announcements: items });
}
