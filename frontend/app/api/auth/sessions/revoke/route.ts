import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { logSecurityEvent, clientInfo } from "@/lib/security";

/* Revoke sessions. Body:
   • { id } — revoke a single session
   • { ids: string[] } — revoke a group of sessions (one device = all its
     logins from the same IP, grouped by the sessions list endpoint)
   • { all: true } — revoke every OTHER session (keep the caller's current one) */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Current session id (so "revoke all" can keep it alive).
  let currentSid: string | null = null;
  try {
    const cookieStore = await cookies();
    const token = await getToken({
      req: {
        cookies: Object.fromEntries(
          cookieStore.getAll().map((c) => [c.name, c.value])
        ),
        headers: {},
      } as any,
      secret: process.env.NEXTAUTH_SECRET,
    });
    currentSid = (token?.sid as string) || null;
  } catch {
    /* ignore */
  }

  const { id, ids, all } = await req.json();
  const { ip, userAgent } = await clientInfo();

  if (all) {
    await prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentSid ? { id: { not: currentSid } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    await logSecurityEvent(userId, "sessions_revoked_all", {
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });
    return NextResponse.json({ ok: true });
  }

  // Revoke a whole device group (list of session ids sharing an IP).
  if (Array.isArray(ids) && ids.length > 0) {
    // Scope strictly to the caller's own sessions (never touch others').
    await prisma.userSession.updateMany({
      where: { userId, revokedAt: null, id: { in: ids } },
      data: { revokedAt: new Date() },
    });
    await logSecurityEvent(userId, "session_revoked", {
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });
    return NextResponse.json({ ok: true });
  }

  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  // Only allow revoking your own sessions.
  const target = await prisma.userSession.findUnique({ where: { id } });
  if (!target || target.userId !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.userSession.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  await logSecurityEvent(userId, "session_revoked", {
    ip: ip ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
