import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveAdmin, getAdmin } from "@/lib/admin";
import { boundedText } from "@/lib/text";
import { findSupportAdmin, serializeSupportTicket } from "@/lib/support";

const includeTicket = {
  user: { select: { id: true, accountName: true, email: true } },
  assignedAdmin: { select: { id: true, accountName: true, adminLevel: true } },
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { accountName: true } } },
  },
};

async function access(id: string) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) return { error: NextResponse.json({ error: "not_authenticated" }, { status: 401 }) };
  const admin = await getAdmin();
  const ticket = await prisma.supportTicket.findUnique({ where: { id }, include: includeTicket });
  if (!ticket) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  if (ticket.userId !== userId && ticket.assignedAdminId !== admin?.id) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ticket, userId, admin };
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await access(id);
  if (result.error) return result.error;
  return NextResponse.json({ ticket: serializeSupportTicket(result.ticket!) });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await access(id);
  if (result.error) return result.error;
  const ticket = result.ticket!;
  const payload = await req.json().catch(() => ({}));
  const action = payload.action;

  if (action === "close") {
    const admin = await getActiveAdmin();
    if (!admin || ticket.assignedAdminId !== admin.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const updated = await prisma.supportTicket.update({
      where: { id },
      data: { status: "closed", closedAt: new Date(), closedById: admin.id },
      include: includeTicket,
    });
    return NextResponse.json({ ticket: serializeSupportTicket(updated) });
  }

  if (action === "reject") {
    const admin = await getActiveAdmin();
    const explanation = boundedText(payload.explanation);
    if (!admin || ticket.assignedAdminId !== admin.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!explanation) return NextResponse.json({ error: "explanation_required" }, { status: 400 });
    const updated = await prisma.supportTicket.update({
      where: { id },
      data: {
        status: "rejected",
        closedAt: new Date(),
        closedById: admin.id,
        messages: { create: { authorId: admin.id, body: explanation, kind: "decision" } },
      },
      include: includeTicket,
    });
    return NextResponse.json({ ticket: serializeSupportTicket(updated) });
  }

  if (action === "forward") {
    const admin = await getActiveAdmin();
    const note = boundedText(payload.note);
    if (!admin || ticket.assignedAdminId !== admin.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (admin.level >= 4) return NextResponse.json({ error: "already_highest_level" }, { status: 400 });
    if (!note) return NextResponse.json({ error: "note_required" }, { status: 400 });
    const nextLevel = Math.min(4, admin.level + 1);
    const nextAdmin = await findSupportAdmin(nextLevel, admin.id);
    if (!nextAdmin) return NextResponse.json({ error: "no_higher_admin_available" }, { status: 503 });
    const updated = await prisma.supportTicket.update({
      where: { id },
      data: {
        assignedLevel: nextLevel,
        assignedAdminId: nextAdmin.id,
        status: "forwarded",
        messages: { create: { authorId: admin.id, body: note, kind: "forward_note" } },
      },
      include: includeTicket,
    });
    return NextResponse.json({ ticket: serializeSupportTicket(updated) });
  }

  if (action === "warning") {
    const admin = await getActiveAdmin();
    const explanation = boundedText(payload.explanation);
    if (!admin || ticket.assignedAdminId !== admin.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!explanation) return NextResponse.json({ error: "explanation_required" }, { status: 400 });
    const activeWarnings = await prisma.warning.count({ where: { targetId: ticket.userId, revokedAt: null } });
    if (activeWarnings >= 3) return NextResponse.json({ error: "warning_cap_reached" }, { status: 400 });
    const thirdWarning = activeWarnings === 2;
    const muteUntil = thirdWarning ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    await prisma.warning.create({ data: { issuerId: admin.id, targetId: ticket.userId, reason: explanation } });
    if (muteUntil) {
      await prisma.user.update({ where: { id: ticket.userId }, data: { mutedAt: new Date(), mutedUntil: muteUntil, muteReason: explanation } });
      await prisma.moderationAction.create({ data: { actorId: admin.id, targetId: ticket.userId, action: "mute", reason: explanation, until: muteUntil } });
    }
    const updated = await prisma.supportTicket.update({
      where: { id },
      data: { messages: { create: { authorId: admin.id, body: explanation, kind: "warning" } } },
      include: includeTicket,
    });
    return NextResponse.json({ ticket: serializeSupportTicket(updated) });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
