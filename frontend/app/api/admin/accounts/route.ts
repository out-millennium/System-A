import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdmin } from "@/lib/admin";
import { regionMatches } from "@/lib/geo";
import { computeStatus } from "@/lib/moderation";

/* Accounts directory for high-level admins (level >= 4).

   Returns a paginated list of accounts with the fields an admin may see, plus
   filters. Search covers: account name, primary email, and ANY linked-platform
   email (e.g. the Google email). Also filter by session IP, by resolved region
   (offline GeoIP), and by admin level(s). An admin can only ever SEE accounts
   at a STRICTLY LOWER admin level than themselves (regular users are level 0);
   the creator (5) sees everyone below 5. This mirrors the moderation rules.

   Query params:
     q         free-text (name / email / linked email), case-insensitive
     ip        substring match on any session IP (e.g. "203.0.113")
     region    GeoIP match on any session IP (country/region code, e.g. "US")
     levels    comma list of admin levels to include: "0" = users, "1".."4"
     cursor    pagination cursor (account id)
     limit     page size (default 25, max 100)
   GET -> { accounts: [...], nextCursor: string|null }
*/
export async function GET(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin || admin.level < 4) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const ip = (sp.get("ip") || "").trim();
  const region = (sp.get("region") || "").trim();
  const cursor = sp.get("cursor") || undefined;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 25, 1), 100);

  // Visibility ceiling: strictly below the caller's level. Users are level 0.
  // A level-4 admin sees levels 0..3; the creator (5) sees 0..4.
  const maxVisibleLevel = admin.level - 1;

  // Parse the requested level filter (defaults to "everything visible").
  let levels: number[];
  const rawLevels = (sp.get("levels") || "").trim();
  if (rawLevels) {
    levels = rawLevels
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 4);
  } else {
    levels = [0, 1, 2, 3, 4];
  }
  // Clamp to what the caller may see.
  levels = levels.filter((n) => n <= maxVisibleLevel);
  if (levels.length === 0) {
    return NextResponse.json({ accounts: [], nextCursor: null });
  }

  const wantUsers = levels.includes(0); // level 0 = regular users
  const wantAdminLevels = levels.filter((n) => n >= 1);

  // Build the Prisma WHERE. Level maps to: role="user" (0) or adminLevel in set.
  const levelOr: any[] = [];
  if (wantUsers) levelOr.push({ role: "user" });
  if (wantAdminLevels.length > 0)
    levelOr.push({ role: "admin", adminLevel: { in: wantAdminLevels } });

  const and: any[] = [{ OR: levelOr }];

  if (q) {
    and.push({
      OR: [
        { accountName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        // Any linked platform email (includes the Google email).
        { accounts: { some: { email: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  if (ip) {
    and.push({ sessions: { some: { ip: { contains: ip } } } });
  }

  // Over-fetch a little so post-filtering by region (which needs GeoIP on the
  // IPs, done in app code) can still fill a page. Cap the scan for safety.
  const scanTake = region ? Math.min(limit * 5, 300) : limit + 1;

  const rows = await prisma.user.findMany({
    where: { AND: and },
    orderBy: { id: "asc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: scanTake,
    select: {
      id: true,
      accountName: true,
      email: true,
      role: true,
      adminLevel: true,
      createdAt: true,
      // All fields computeStatus() needs so the row status matches the rest of
      // the app (handles permanent vs timed vs expired, and warning-mutes).
      bannedAt: true,
      bannedUntil: true,
      banReason: true,
      mutedAt: true,
      mutedUntil: true,
      muteReason: true,
      adminMutedUntil: true,
      adminMuteReason: true,
      apiKey: true,
      accounts: { select: { provider: true, email: true } },
      sessions: {
        select: { ip: true, userAgent: true, lastSeenAt: true },
        orderBy: { lastSeenAt: "desc" },
        take: 5,
      },
    },
  });

  let filtered = rows;
  if (region) {
    filtered = rows.filter((u) =>
      u.sessions.some((s) => regionMatches(s.ip, region))
    );
  }

  // Determine the page + next cursor.
  const page = filtered.slice(0, limit);
  const nextCursor =
    filtered.length > limit || (region && rows.length === scanTake)
      ? page[page.length - 1]?.id ?? null
      : filtered.length > limit
        ? page[page.length - 1]?.id ?? null
        : null;

  const accounts = page.map((u) => {
    const lastSession = u.sessions[0];
    const level = u.role === "admin" && u.adminLevel ? u.adminLevel : 0;
    // Mirror the moderation rule (see /api/admin/moderation): the caller may act
    // on an account only when it is not their own and it is at a STRICTLY lower
    // admin level. Regular users (level 0) are always actionable by level >= 4.
    const canModerate = u.id !== admin.id && level < admin.level;
    // Use the canonical moderation evaluation (same as the moderation panel and
    // the enforcement gates) so a permanent mute / expired timed ban is shown
    // consistently — a naive "mutedUntil > now" would miss permanent mutes.
    const status = computeStatus(u);
    return {
      id: u.id,
      accountName: u.accountName,
      email: u.email,
      // Level: 0 for users, else the admin level.
      level,
      canModerate,
      linkedEmails: u.accounts
        .map((a) => a.email)
        .filter((e): e is string => Boolean(e)),
      providers: u.accounts.map((a) => a.provider),
      createdAt: u.createdAt,
      hasKey: Boolean(u.apiKey),
      banned: status.banned.active,
      muted: status.muted.active,
      lastIp: lastSession?.ip ?? null,
      lastSeenAt: lastSession?.lastSeenAt ?? null,
    };
  });

  return NextResponse.json({ accounts, nextCursor, viewerLevel: admin.level });
}
