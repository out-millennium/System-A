import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCreator } from "@/lib/admin";

/* Read the append-only audit log of high-privilege actions. Creator-only. */
export async function GET() {
  const creator = await getCreator();
  if (!creator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      action: e.action,
      actor: e.actorName,
      target: e.targetName,
      detail: e.detail,
      createdAt: e.createdAt,
    })),
  });
}
