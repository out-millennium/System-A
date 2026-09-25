import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getModerationStatus } from "@/lib/moderation";
import { boundedText } from "@/lib/text";

/* A restricted user appeals their current ban/mute.
   GET  — whether an appeal is possible (there is an active restriction whose
     issuing admin is below level 5, and no open appeal already exists).
   POST { reason } — file the appeal against the latest ban/mute action.

   Punishments from the creator (level 5) cannot be appealed. */

async function latestActiveAction(userId: string) {
  const status = await getModerationStatus(userId);
  if (!status) return { status: null, action: null };
  const kind = status.banned.active ? "ban" : status.muted.active ? "mute" : null;
  if (!kind) return { status, action: null };
  // Most recent action of that kind for this user.
  const action = await prisma.moderationAction.findFirst({
    where: { targetId: userId, action: kind },
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { adminLevel: true } } },
  });
  return { status, action };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { action } = await latestActiveAction(userId);
  if (!action) return NextResponse.json({ appealable: false });

  // Creator-issued punishments are final.
  if ((action.actor.adminLevel ?? 0) >= 5) {
    return NextResponse.json({ appealable: false, reason: "final" });
  }

  const open = await prisma.moderationAppeal.findFirst({
    where: { actionId: action.id, status: "open" },
  });
  return NextResponse.json({
    appealable: !open,
    alreadyFiled: Boolean(open),
    actionId: action.id,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { reason } = await req.json().catch(() => ({}));
  const text = boundedText(reason); // trimmed + capped
  if (!text) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const { action } = await latestActiveAction(userId);
  if (!action) {
    return NextResponse.json({ error: "nothing_to_appeal" }, { status: 400 });
  }
  if ((action.actor.adminLevel ?? 0) >= 5) {
    return NextResponse.json({ error: "final" }, { status: 403 });
  }

  const open = await prisma.moderationAppeal.findFirst({
    where: { actionId: action.id, status: "open" },
  });
  if (open) {
    return NextResponse.json({ error: "already_filed" }, { status: 400 });
  }

  await prisma.moderationAppeal.create({
    data: { actionId: action.id, filerId: userId, reason: text },
  });
  return NextResponse.json({ ok: true });
}
