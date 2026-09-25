import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdmin } from "@/lib/admin";
import {
  findSupportAdmin,
  readSupportPhoto,
  serializeSupportTicket,
  supportBody,
  SUPPORT_LEVELS,
} from "@/lib/support";

const includeTicket = {
  user: { select: { accountName: true, email: true } },
  assignedAdmin: { select: { accountName: true } },
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { accountName: true } } },
  },
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const admin = await getAdmin();
  const category = new URL(req.url).searchParams.get("category");
  const where = admin
    ? { assignedAdminId: admin.id, ...(category ? { category } : {}) }
    : { userId, ...(category ? { category } : {}) };
  const tickets = await prisma.supportTicket.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: includeTicket,
  });
  return NextResponse.json({
    tickets: tickets.map((ticket) => serializeSupportTicket(ticket)),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboarded: true, role: true },
  });
  if (!me?.onboarded) return NextResponse.json({ error: "not_onboarded" }, { status: 403 });
  if (me.role === "admin") return NextResponse.json({ error: "admins_use_queue" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  const requestedLevel = Number(form.get("requestedLevel"));
  const category = form.get("category") === "proposal" ? "proposal" : "support";
  const body = supportBody(form.get("body"));
  if (!SUPPORT_LEVELS.includes(requestedLevel as (typeof SUPPORT_LEVELS)[number])) {
    return NextResponse.json({ error: "invalid_level" }, { status: 400 });
  }
  if (!body) return NextResponse.json({ error: "body_required" }, { status: 400 });

  const existing = await prisma.supportTicket.findFirst({
    where: { userId, category, status: { in: ["open", "active", "forwarded"] } },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ error: "open_ticket_exists", ticketId: existing.id }, { status: 400 });

  const admin = await findSupportAdmin(requestedLevel, userId);
  if (!admin) return NextResponse.json({ error: "no_admin_available" }, { status: 503 });

  let photo = null;
  try {
    photo = await readSupportPhoto(form);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "invalid_photo" }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId,
      category,
      requestedLevel,
      assignedLevel: requestedLevel,
      assignedAdminId: admin.id,
      status: "open",
      messages: {
        create: {
          authorId: userId,
          body,
          ...(photo
            ? { attachmentData: photo.data, attachmentMime: photo.mime, attachmentName: photo.name }
            : {}),
        },
      },
    },
    include: includeTicket,
  });

  return NextResponse.json({ ticket: serializeSupportTicket(ticket) }, { status: 201 });
}
