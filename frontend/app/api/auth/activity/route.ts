import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/* A unified moderation/activity feed for the CURRENT user: warnings received,
   ban/mute actions taken against them, their appeals and their account
   deletion / key-revocation requests, each with a status. Powers the profile
   "Moderation activity" section and the status-change notifications. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

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

  type Item = {
    id: string;
    kind: string; // warning | ban | mute | unban | unmute | appeal | deletion | keyRevocation
    status: string | null; // open | upheld | dismissed | approved | rejected | revoked | active
    reason: string | null;
    by: string | null;
    createdAt: string;
  };

  const items: Item[] = [];

  for (const w of warnings) {
    items.push({
      id: `w_${w.id}`,
      kind: "warning",
      status: w.revokedAt ? "revoked" : "active",
      reason: w.reason,
      by: w.issuer.accountName,
      createdAt: w.createdAt.toISOString(),
    });
  }
  for (const a of actions) {
    items.push({
      id: `a_${a.id}`,
      kind: a.action,
      status: null,
      reason: a.reason,
      by: null,
      createdAt: a.createdAt.toISOString(),
    });
  }
  // A reviewer's rejection/dismissal note (if any) is shown after the user's
  // own reason so they can see WHY it was turned down.
  const withNote = (own: string | null, note: string | null) =>
    note ? `${own ?? ""}${own ? "\n" : ""}— ${note}` : own;

  for (const ap of appeals) {
    items.push({
      id: `ap_${ap.id}`,
      kind: `appeal_${ap.action.action}`,
      status: ap.status, // open | upheld | dismissed
      reason: withNote(ap.reason, ap.reviewNote),
      by: null,
      createdAt: ap.createdAt.toISOString(),
    });
  }
  for (const d of deletions) {
    items.push({
      id: `d_${d.id}`,
      kind: "deletion",
      status: d.status, // open | approved | rejected
      reason: withNote(d.reason, d.reviewNote),
      by: null,
      createdAt: d.createdAt.toISOString(),
    });
  }
  for (const k of keyRevs) {
    items.push({
      id: `k_${k.id}`,
      kind: "keyRevocation",
      status: k.status, // open | approved | rejected
      reason: withNote(k.reason, k.reviewNote),
      by: null,
      createdAt: k.createdAt.toISOString(),
    });
  }
  for (const ap of applications) {
    items.push({
      id: `app_${ap.id}`,
      kind: "application",
      status: ap.status, // open | approved | rejected | withdrawn
      reason: withNote(ap.reason, ap.reviewNote),
      by: null,
      createdAt: ap.createdAt.toISOString(),
    });
  }

  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ items });
}
