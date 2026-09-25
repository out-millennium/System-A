import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveAdmin, getAdmin } from "@/lib/admin";
import { readSupportPhoto, supportBody } from "@/lib/support";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { userId: true, assignedAdminId: true, status: true } });
  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = await getAdmin();
  const isUser = ticket.userId === userId;
  const isAssignedAdmin = ticket.assignedAdminId === admin?.id;
  if (!isUser && !isAssignedAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (["closed", "rejected"].includes(ticket.status)) return NextResponse.json({ error: "ticket_closed" }, { status: 400 });
  if (isAssignedAdmin && !(await getActiveAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  const body = supportBody(form.get("body"));
  if (!body && !(form.get("photo") instanceof File)) return NextResponse.json({ error: "body_required" }, { status: 400 });
  let photo = null;
  try {
    photo = await readSupportPhoto(form);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "invalid_photo" }, { status: 400 });
  }
  const message = await prisma.supportMessage.create({
    data: {
      ticketId: id,
      authorId: userId,
      body,
      ...(photo ? { attachmentData: photo.data, attachmentMime: photo.mime, attachmentName: photo.name } : {}),
    },
    include: { author: { select: { accountName: true } } },
  });
  await prisma.supportTicket.update({ where: { id }, data: { status: isUser ? "active" : "active" } });
  return NextResponse.json({ message: { id: message.id, body: message.body, kind: message.kind, createdAt: message.createdAt } }, { status: 201 });
}
