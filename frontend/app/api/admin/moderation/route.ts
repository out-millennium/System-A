import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdmin, getActiveAdmin } from "@/lib/admin";
import { computeStatus } from "@/lib/moderation";
import { sendMail } from "@/lib/mail";
import { boundedText } from "@/lib/text";

/* User moderation by admins (Stage 5). Level >= 4.
   POST { identifier, action: "ban"|"mute"|"unban"|"unmute", reason, hours }
     • reason required for ban/mute; hours omitted/0 => permanent.
     • Can moderate regular users and STRICTLY LOWER-level admins only.
     • Logs the action and notifies the target by direct message.
   GET  ?identifier=... — look up a user: live ban/mute status + whether the
     caller may moderate them; also returns the caller's recent action history. */

const MOD_SELECT = {
  bannedAt: true,
  bannedUntil: true,
  banReason: true,
  mutedAt: true,
  mutedUntil: true,
  muteReason: true,
  adminMutedUntil: true,
  adminMuteReason: true,
} as const;

export async function GET(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (admin.level < 4) {
    return NextResponse.json({ error: "level_too_low" }, { status: 403 });
  }

  const identifier = (req.nextUrl.searchParams.get("identifier") || "").trim();

  // Recent history of the caller's own moderation actions.
  const history = await prisma.moderationAction.findMany({
    where: { actorId: admin.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { target: { select: { accountName: true, email: true } } },
  });
  const historyOut = history.map((h) => ({
    id: h.id,
    action: h.action,
    target: h.target.accountName ?? h.target.email,
    reason: h.reason,
    until: h.until ? h.until.toISOString() : null,
    createdAt: h.createdAt,
  }));

  if (!identifier) {
    return NextResponse.json({ found: false, history: historyOut });
  }

  const target = await prisma.user.findFirst({
    where: { OR: [{ accountName: identifier }, { email: identifier }] },
    select: {
      id: true,
      accountName: true,
      email: true,
      role: true,
      adminLevel: true,
      ...MOD_SELECT,
    },
  });
  if (!target) {
    return NextResponse.json({ found: false, history: historyOut });
  }

  const canModerate =
    target.id !== admin.id &&
    !(target.role === "admin" && target.adminLevel && target.adminLevel >= admin.level);

  const status = computeStatus(target);

  return NextResponse.json({
    found: true,
    canModerate,
    target: {
      accountName: target.accountName,
      email: target.email,
      isAdmin: target.role === "admin",
      adminLevel: target.adminLevel,
    },
    status,
    history: historyOut,
  });
}

export async function POST(req: NextRequest) {
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (admin.level < 4) {
    return NextResponse.json({ error: "level_too_low" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const identifier: string = body.identifier?.trim?.() ?? "";
  const action: string = body.action;
  const reason: string = boundedText(body.reason); // trimmed + capped
  const hours = Number(body.hours);

  if (!identifier) {
    return NextResponse.json({ error: "identifier_required" }, { status: 400 });
  }
  if (!["ban", "mute", "unban", "unmute"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { OR: [{ accountName: identifier }, { email: identifier }] },
    select: { id: true, role: true, adminLevel: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  if (target.id === admin.id) {
    return NextResponse.json({ error: "cannot_self" }, { status: 403 });
  }
  if (
    target.role === "admin" &&
    target.adminLevel &&
    target.adminLevel >= admin.level
  ) {
    return NextResponse.json({ error: "not_lower" }, { status: 403 });
  }
  if ((action === "ban" || action === "mute") && !reason) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  let until: Date | null = null;
  if (Number.isFinite(hours) && hours > 0) {
    until = new Date(Date.now() + hours * 60 * 60 * 1000);
  }
  const now = new Date();

  if (action === "ban") {
    await prisma.user.update({
      where: { id: target.id },
      // wasBanned is a permanent mark — set on every ban, never cleared.
      data: { bannedAt: now, bannedUntil: until, banReason: reason, wasBanned: true },
    });
  } else if (action === "mute") {
    await prisma.user.update({
      where: { id: target.id },
      data: { mutedAt: now, mutedUntil: until, muteReason: reason },
    });
  } else if (action === "unban") {
    await prisma.user.update({
      where: { id: target.id },
      data: { bannedAt: null, bannedUntil: null, banReason: null },
    });
  } else if (action === "unmute") {
    await prisma.user.update({
      where: { id: target.id },
      data: { mutedAt: null, mutedUntil: null, muteReason: null },
    });
  }

  // History log.
  await prisma.moderationAction.create({
    data: {
      actorId: admin.id,
      targetId: target.id,
      action,
      reason: reason || null,
      until,
    },
  });

  // Notify the target by direct message (best-effort).
  try {
    const untilText = until
      ? ` (until ${until.toISOString().slice(0, 16).replace("T", " ")} UTC)`
      : action === "ban" || action === "mute"
        ? " (permanent)"
        : "";
    const body = `Moderation: ${action}${reason ? ` — ${reason}` : ""}${untilText}`;
    await prisma.directMessage.create({
      data: { senderId: admin.id, recipientId: target.id, body },
    });
    // Also email the target (best-effort; only sent when SMTP is configured).
    if (target.email) {
      await sendMail({
        to: target.email,
        subject: `System A — account ${action}`,
        text: body,
      });
    }
  } catch {
    /* notification is best-effort */
  }

  return NextResponse.json({
    ok: true,
    until: until ? until.toISOString() : null,
  });
}
