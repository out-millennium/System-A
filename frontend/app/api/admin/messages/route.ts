import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdmin, getActiveAdmin } from "@/lib/admin";
import { boundedText, MAX_BODY } from "@/lib/text";

/* Admin → user direct messages. Level >= 2 only.
   POST { recipient: "<accountName or email>", body } — send a message.
   GET  — messages this admin has sent (recent). */

export async function POST(req: NextRequest) {
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (admin.level < 2) {
    return NextResponse.json({ error: "level_too_low" }, { status: 403 });
  }

  const { recipient, body } = await req.json().catch(() => ({}));
  const target = typeof recipient === "string" ? recipient.trim() : "";
  const text = boundedText(body, MAX_BODY); // trimmed + capped
  if (!target) {
    return NextResponse.json({ error: "recipient_required" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "body_required" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ accountName: target }, { email: target }] },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  await prisma.directMessage.create({
    data: { senderId: admin.id, recipientId: user.id, body: text },
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (admin.level < 2) {
    return NextResponse.json({ error: "level_too_low" }, { status: 403 });
  }

  const sent = await prisma.directMessage.findMany({
    where: { senderId: admin.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { recipient: { select: { accountName: true } } },
  });

  return NextResponse.json({
    sent: sent.map((m) => ({
      id: m.id,
      body: m.body,
      to: m.recipient.accountName,
      createdAt: m.createdAt,
    })),
  });
}
