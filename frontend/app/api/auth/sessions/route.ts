import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

/* List active (non-revoked) sessions for the current account, flagging which
   one is the caller's current session. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Identify the caller's current session id from the JWT.
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

  const sessions = await prisma.userSession.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
  });

  // Group sessions by unique IP so the same device (repeat sign-ins from one
  // IP) shows as ONE entry rather than a growing list of logins. Sessions with
  // no recorded IP are each kept separate (we cannot tell them apart). Within a
  // group we keep the most-recently-seen session's device info, the earliest
  // createdAt (first seen), and collect ALL underlying session ids so a single
  // "sign out" revokes every session from that device.
  type Group = {
    id: string; // the representative (most recent) session id
    ids: string[]; // all session ids sharing this IP
    ip: string | null;
    userAgent: string | null;
    createdAt: Date;
    lastSeenAt: Date;
    current: boolean;
  };
  const groups: Group[] = [];
  const byIp = new Map<string, Group>();

  for (const s of sessions) {
    const isCurrent = s.id === currentSid;
    // Only collapse rows that actually have an IP; null-IP rows stay separate.
    const key = s.ip ? `ip:${s.ip}` : `sid:${s.id}`;
    const existing = byIp.get(key);
    if (existing) {
      existing.ids.push(s.id);
      // sessions are ordered by lastSeenAt desc, so the first one seen for a
      // group is already the most recent → keep its representative fields.
      if (s.createdAt < existing.createdAt) existing.createdAt = s.createdAt;
      if (s.lastSeenAt > existing.lastSeenAt) existing.lastSeenAt = s.lastSeenAt;
      if (isCurrent) existing.current = true;
    } else {
      const g: Group = {
        id: s.id,
        ids: [s.id],
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: isCurrent,
      };
      byIp.set(key, g);
      groups.push(g);
    }
  }

  return NextResponse.json({
    currentSid,
    sessions: groups.map((g) => ({
      id: g.id,
      ids: g.ids,
      ip: g.ip,
      userAgent: g.userAgent,
      createdAt: g.createdAt,
      lastSeenAt: g.lastSeenAt,
      current: g.current,
    })),
  });
}
