import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdmin } from "@/lib/admin";
import { boundedText } from "@/lib/text";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const message = await prisma.supportMessage.findUnique({
    where: { id },
    include: { ticket: { select: { userId: true, assignedAdminId: true } } },
  });
  if (!message) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = await getAdmin();
  if (message.ticket.userId !== userId && message.ticket.assignedAdminId !== admin?.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (message.authorId === userId) return NextResponse.json({ error: "cannot_complain_own_message" }, { status: 400 });
  const { reason } = await req.json().catch(() => ({}));
  const text = boundedText(reason);
  if (!text) return NextResponse.json({ error: "reason_required" }, { status: 400 });
  try {
    await prisma.supportMessageComplaint.create({ data: { messageId: id, filerId: userId, reason: text } });
  } catch {
    return NextResponse.json({ error: "already_filed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
