import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import en from "@/lib/i18n/messages/en";
import ru from "@/lib/i18n/messages/ru";
import zh from "@/lib/i18n/messages/zh";
import fr from "@/lib/i18n/messages/fr";
import es from "@/lib/i18n/messages/es";

/* Incoming-decision notifications for the CURRENT user.

   "Incoming" = things an admin did TO this user that carry text: warnings
   received, ban/mute actions, and terminal decisions on this user's appeals /
   applications / deletion & key-revocation requests (upheld/dismissed/approved/
   rejected). The user's own still-open submissions are NOT notified.

   On call (dashboard entry) this endpoint:
     1. Finds eligible incoming events with no receipt yet.
     2. Creates ONE system DirectMessage per event, ALREADY READ (so it lands in
        the inbox history without bumping the unread badge), deduped by refId.
     3. Returns the freshly-created notifications so the client can toast them
        (each with a href to jump to the relevant place).

   Idempotent: refId is unique, so repeat calls never duplicate a receipt. */

const CATALOGUES = { en, ru, zh, fr, es } as const;
type Locale = keyof typeof CATALOGUES;

function pickLocale(raw: string | undefined): Locale {
  if (raw && raw in CATALOGUES) return raw as Locale;
  return "en";
}

// Minimal server-side resolver for dotted i18n keys.
function tr(loc: Locale, path: string): string {
  const parts = path.split(".");
  let cur: unknown = CATALOGUES[loc];
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      cur = undefined;
      break;
    }
  }
  if (typeof cur !== "string") {
    // fall back to English, then the raw key
    let e: unknown = CATALOGUES.en;
    for (const p of parts) {
      if (e && typeof e === "object" && p in (e as Record<string, unknown>)) {
        e = (e as Record<string, unknown>)[p];
      } else {
        e = undefined;
        break;
      }
    }
    return typeof e === "string" ? e : path;
  }
  return cur;
}

const kindKey = (kind: string): string => {
  if (kind.startsWith("appeal_")) return "kindAppeal";
  const map: Record<string, string> = {
    warning: "kindWarning",
    ban: "kindBan",
    mute: "kindMute",
    unban: "kindUnban",
    unmute: "kindUnmute",
    deletion: "kindDeletion",
    keyRevocation: "kindKeyRevocation",
    application: "kindApplication",
  };
  return map[kind] ?? "kindWarning";
};

const statusKey = (status: string): string =>
  ({
    active: "statusActive",
    revoked: "statusRevoked",
    upheld: "statusUpheld",
    dismissed: "statusDismissed",
    approved: "statusApproved",
    rejected: "statusRejected",
  } as Record<string, string>)[status] ?? status;

// Base target: the profile's "Moderation activity" section. A per-item anchor
// (#mod-<refId>) lets the click jump to and highlight the exact record.
const HREF = "/dashboard/profile#moderation-activity";
const itemHref = (refId: string) => `/dashboard/profile#mod-${refId}`;

/* List recent notification receipts (the system messages) for the bell menu.
   Returns the most recent ones plus the total count, so the UI can show the
   latest few and an "and N more" row. `createdAt` lets the client compute a
   badge against a locally-remembered "last opened" timestamp. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const [rows, total, me] = await Promise.all([
    prisma.directMessage.findMany({
      where: { recipientId: userId, system: true },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, body: true, refId: true, createdAt: true },
    }),
    prisma.directMessage.count({
      where: { recipientId: userId, system: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { notificationsSeenAt: true },
    }),
  ]);

  return NextResponse.json({
    total,
    href: HREF,
    // Server-side "last opened" timestamp so the badge is consistent across
    // devices (the client no longer relies on localStorage for correctness).
    seenAt: me?.notificationsSeenAt ? me.notificationsSeenAt.toISOString() : null,
    notifications: rows.map((r) => ({
      id: r.id,
      // Title = first line; the full text (with reason) lives in the inbox.
      title: r.body.split("\n")[0],
      body: r.body,
      // Per-item deep link when we know the source event; else the section.
      href: r.refId ? itemHref(r.refId) : HREF,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// Mark the bell as opened now (records notificationsSeenAt server-side).
export async function PATCH() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { notificationsSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const loc = pickLocale(cookieStore.get("sa-lang")?.value);

  // Pull the same incoming events the activity feed shows.
  const [warnings, actions, appeals, deletions, keyRevs, applications] =
    await Promise.all([
      prisma.warning.findMany({
        where: { targetId: userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { issuer: { select: { accountName: true } } },
      }),
      prisma.moderationAction.findMany({
        where: { targetId: userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.moderationAppeal.findMany({
        where: { filerId: userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { action: { select: { action: true } } },
      }),
      prisma.accountDeletionRequest.findMany({
        where: { requesterId: userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.apiKeyRevocationRequest.findMany({
        where: { requesterId: userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.adminApplication.findMany({
        where: { applicantId: userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  type Eligible = {
    refId: string;
    kind: string;
    status: string;
    reason: string | null;
  };
  const eligible: Eligible[] = [];

  // Warnings received (an admin warned me) — the active (non-revoked) ones.
  for (const w of warnings) {
    if (!w.revokedAt) {
      eligible.push({
        refId: `w_${w.id}`,
        kind: "warning",
        status: "active",
        reason: w.reason,
      });
    }
  }
  // Ban/mute actions taken against me (incoming). unban/unmute are lifts — we
  // still notify since they concern the user directly.
  for (const a of actions) {
    eligible.push({
      refId: `a_${a.id}`,
      kind: a.action,
      status: "active",
      reason: a.reason,
    });
  }
  // Terminal decisions on MY appeals / requests / applications (incoming
  // decisions). Open ones are not notified.
  const terminal = new Set(["upheld", "dismissed", "approved", "rejected"]);
  for (const ap of appeals) {
    if (terminal.has(ap.status)) {
      eligible.push({
        refId: `ap_${ap.id}`,
        kind: `appeal_${ap.action.action}`,
        status: ap.status,
        reason: ap.reviewNote ?? null,
      });
    }
  }
  for (const d of deletions) {
    if (terminal.has(d.status)) {
      eligible.push({
        refId: `d_${d.id}`,
        kind: "deletion",
        status: d.status,
        reason: d.reviewNote ?? null,
      });
    }
  }
  for (const k of keyRevs) {
    if (terminal.has(k.status)) {
      eligible.push({
        refId: `k_${k.id}`,
        kind: "keyRevocation",
        status: k.status,
        reason: k.reviewNote ?? null,
      });
    }
  }
  for (const ap of applications) {
    if (terminal.has(ap.status)) {
      eligible.push({
        refId: `app_${ap.id}`,
        kind: "application",
        status: ap.status,
        reason: ap.reviewNote ?? null,
      });
    }
  }

  // Retention: prune the user's OWN system receipts older than the retention
  // window so they don't accumulate forever. Real admin messages are untouched.
  const RETENTION_DAYS = Number(process.env.NOTIFY_RETENTION_DAYS || "90");
  if (RETENTION_DAYS > 0) {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000);
    await prisma.directMessage.deleteMany({
      where: { recipientId: userId, system: true, createdAt: { lt: cutoff } },
    });
  }

  if (eligible.length === 0) {
    return NextResponse.json({ notifications: [] });
  }

  // Which of these already have a receipt?
  const existing = await prisma.directMessage.findMany({
    where: { recipientId: userId, refId: { in: eligible.map((e) => e.refId) } },
    select: { refId: true },
  });
  const have = new Set(existing.map((e) => e.refId));
  const fresh = eligible.filter((e) => !have.has(e.refId));

  const created: {
    id: string;
    body: string;
    href: string;
    positive: boolean;
  }[] = [];

  for (const e of fresh) {
    const kindLabel = tr(loc, `feed.${kindKey(e.kind)}`);
    const statusLabel = tr(loc, `feed.${statusKey(e.status)}`);
    // e.g. "Appeal: Dismissed — <reason>"
    let body = `${kindLabel}: ${statusLabel}`;
    if (e.reason) body += `\n${e.reason}`;

    // Create the receipt ALREADY READ (readAt set), sender = self + system flag
    // so the inbox shows "System A" and the unread badge is untouched. Guard the
    // unique refId race with a try/catch.
    try {
      const msg = await prisma.directMessage.create({
        data: {
          senderId: userId,
          recipientId: userId,
          system: true,
          refId: e.refId,
          body,
          readAt: new Date(),
        },
        select: { id: true },
      });
      const positive =
        e.status === "upheld" ||
        e.status === "approved" ||
        e.kind === "unban" ||
        e.kind === "unmute";
      created.push({ id: msg.id, body, href: itemHref(e.refId), positive });
    } catch {
      // Unique violation => another request created it first; skip.
    }
  }

  return NextResponse.json({ notifications: created });
}
