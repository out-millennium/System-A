import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, verifyOwnPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { selfManageBlockReason } from "@/lib/moderation";

/* An admin requests revocation of their OWN API key (with a reason). Reviewed by
   level 4 (or the creator, if the requester IS level 4). The creator (level 5)
   cannot revoke their own key and cannot file this request.
   (Regular users revoke their key directly via /api/auth/revoke.)
   GET  — the requester's latest request status.
   POST { reason } — file a request (one open at a time). */

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const latest = await prisma.apiKeyRevocationRequest.findFirst({
    where: { requesterId: userId },
    orderBy: { createdAt: "desc" },
    select: { status: true, createdAt: true },
  });
  return NextResponse.json({ request: latest });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, adminLevel: true },
  });
  if (!me || me.role !== "admin" || !me.adminLevel) {
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }
  if (me.adminLevel >= 5) {
    // The creator cannot revoke their own key (symmetric to account deletion).
    return NextResponse.json({ error: "creator_cannot" }, { status: 403 });
  }
  // A muted or (ever-)banned admin cannot even file the request.
  const block = await selfManageBlockReason(userId);
  if (block) {
    return NextResponse.json({ error: "restricted", reason: block }, { status: 403 });
  }

  const { reason, password } = await req.json().catch(() => ({}));
  // Require the account password to confirm this sensitive action.
  if (!(await verifyOwnPassword(userId, typeof password === "string" ? password : ""))) {
    return NextResponse.json({ error: "invalid_password" }, { status: 400 });
  }
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const open = await prisma.apiKeyRevocationRequest.findFirst({
    where: { requesterId: userId, status: "open" },
  });
  if (open) {
    return NextResponse.json({ error: "already_open" }, { status: 400 });
  }

  await prisma.apiKeyRevocationRequest.create({
    data: { requesterId: userId, reason: text },
  });
  return NextResponse.json({ ok: true });
}
