import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/* The current user's received direct messages.
   GET   — list (most recent first), with sender display name.
   PATCH { id } — mark a message as read. */

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const messages = await prisma.directMessage.findMany({
    where: { recipientId: userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { sender: { select: { accountName: true } } },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      // System receipts show as "System A" rather than the (self) sender name.
      from: m.system ? null : m.sender.accountName,
      system: m.system,
      read: m.readAt !== null,
      createdAt: m.createdAt,
    })),
    // System receipts are created already-read, so they never affect this count.
    unread: messages.filter((m) => m.readAt === null).length,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { id, all } = await req.json().catch(() => ({}));

  // "Mark all read": clears every unread message for this user in one call.
  if (all) {
    await prisma.directMessage.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // Only allow marking your own messages.
  const msg = await prisma.directMessage.findUnique({ where: { id } });
  if (!msg || msg.recipientId !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!msg.readAt) {
    await prisma.directMessage.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true });
}
