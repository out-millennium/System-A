import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { selfManageBlockReason } from "@/lib/moderation";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { clientKey, rateLimit } from "@/lib/ratelimit";

/* Constant-time string compare (avoid leaking the key via response timing). */
function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/* Permanently delete the current (fully onboarded) account.
   Requires the account password as confirmation when the account has one
   (credentials users). OAuth-only accounts with no password can confirm
   without it. Cascades remove linked methods, sessions, events and tokens.
   The client signs out afterwards. */
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "account-delete"), 3, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  }
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // A muted or (ever-)banned account cannot delete itself.
  const block = await selfManageBlockReason(userId);
  if (block) {
    return NextResponse.json({ error: "restricted", reason: block }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const password: string | undefined =
    typeof body.password === "string" ? body.password : undefined;
  const providedKey: string =
    typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  // Confirm deletion with EITHER the account password OR the account's own
  // api_key (constant-time). Accounts with neither a password nor a key (rare
  // OAuth-only without a key) can confirm without either.
  const okByKey = providedKey && me.apiKey ? safeEqual(providedKey, me.apiKey) : false;
  if (!okByKey) {
    // Fall back to password confirmation when the account has a password.
    if (me.password) {
      if (!password) {
        return NextResponse.json({ error: "password_required" }, { status: 400 });
      }
      const ok = await bcrypt.compare(password, me.password);
      if (!ok) {
        return NextResponse.json({ error: "invalid_password" }, { status: 400 });
      }
    }
  }

  // Cascade removes LinkedAccount / UserSession / SecurityEvent / reset tokens.
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
