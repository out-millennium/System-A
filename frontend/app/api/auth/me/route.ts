import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { selfManageBlockReason } from "@/lib/moderation";

/* Returns the current account's onboarding status and its linked sign-in
   methods. Used by the onboarding UI and the account settings. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: true },
  });
  if (!me) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const providers = Array.from(new Set(me.accounts.map((a) => a.provider)));

  // Whether self key-revocation / account deletion is blocked (muted, banned,
  // or ever-banned) — lets the settings UI disable those actions with a reason.
  const selfManageBlocked = await selfManageBlockReason(userId);

  return NextResponse.json({
    email: me.email,
    accountName: me.accountName,
    onboarded: me.onboarded,
    providers, // e.g. ["credentials", "google", "github"]
    hasPassword: Boolean(me.password),
    totpEnabled: me.totpEnabled,
    role: me.role,
    adminLevel: me.adminLevel,
    selfManageBlocked, // "muted" | "banned" | "was_banned" | null
  });
}
