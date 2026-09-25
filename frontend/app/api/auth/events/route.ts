import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/* Return the most recent security events (audit log) for the current account. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const events = await prisma.securityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      ip: e.ip,
      createdAt: e.createdAt,
    })),
  });
}
