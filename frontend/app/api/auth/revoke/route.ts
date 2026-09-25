import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, verifyOwnPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { selfManageBlockReason } from "@/lib/moderation";
import { timingSafeEqual } from "crypto";

const CORE_API_URL = process.env.CORE_API_URL!;
const CORE_ADMIN_KEY = process.env.CORE_ADMIN_KEY!;

/* Constant-time string compare (avoids leaking the key via response timing). */
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

/* Revoke the CURRENT user's own Core API key.

   Security: this endpoint uses the Core admin key, so it must never revoke an
   arbitrary key supplied by the caller. It requires an authenticated session
   AND proof of ownership via EITHER the account PASSWORD OR the account's own
   api_key (whichever the user has). It revokes only the key stored on that
   user's own account. Admins (level 1–4) must instead file a revocation REQUEST;
   the creator (level 5) cannot revoke their own key at all. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, adminLevel: true, apiKey: true },
  });
  if (!me) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Confirm ownership with EITHER the account password OR the api_key itself.
  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const providedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const okByPassword = password ? await verifyOwnPassword(userId, password) : false;
  const okByKey = providedKey && me.apiKey ? safeEqual(providedKey, me.apiKey) : false;
  if (!okByPassword && !okByKey) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 400 });
  }

  // A muted or (ever-)banned account cannot revoke its key.
  const block = await selfManageBlockReason(userId);
  if (block) {
    return NextResponse.json({ error: "restricted", reason: block }, { status: 403 });
  }

  // Admins go through the request/approval flow instead of direct revocation.
  if (me.role === "admin" && me.adminLevel) {
    return NextResponse.json({ error: "use_request_flow" }, { status: 403 });
  }

  if (!me.apiKey) {
    return NextResponse.json({ error: "no_key" }, { status: 400 });
  }

  try {
    const res = await fetch(`${CORE_API_URL}/account/api_key`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": CORE_ADMIN_KEY,
      },
      // Only ever the caller's own stored key — never a value from the request.
      body: JSON.stringify({ api_key: me.apiKey }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.detail || "revoke_failed" },
        { status: res.status }
      );
    }
    await prisma.user.update({
      where: { id: userId },
      data: { apiKey: null },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
