import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const CORE_API_URL = process.env.CORE_API_URL!;
const CORE_ADMIN_KEY = process.env.CORE_ADMIN_KEY!;

/* Withdrawal confirmation challenges for the CURRENT user.

   An external application (e.g. Meridian) can request a challenge before a
   withdrawal. The owner sees it here and either APPROVES (revealing a 6-digit
   code to type back into the external app) or DENIES. This route always acts on
   the SESSION's own account — the account name is taken from the session, never
   from the client — and proxies to Core with the admin key.

   GET  → { challenges: [...] } pending for the user.
   POST { id, action: "approve"|"deny" }
        → approve: { code, expires_at } (shown once to the owner);
          deny:    { status: "ok" }. */

export async function GET() {
  const session = await getServerSession(authOptions);
  const account = session?.user?.accountName as string | undefined;
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const enc = encodeURIComponent(account);
    // Pending challenges (to approve/deny) + challenges that expired while the
    // owner was away (shown once as a notice).
    const [pendRes, expRes] = await Promise.all([
      fetch(`${CORE_API_URL}/withdrawal_challenges/${enc}`, {
        headers: { "x-admin-key": CORE_ADMIN_KEY },
        cache: "no-store",
      }),
      fetch(`${CORE_API_URL}/withdrawal_challenges/${enc}/expired`, {
        headers: { "x-admin-key": CORE_ADMIN_KEY },
        cache: "no-store",
      }),
    ]);
    const challenges = pendRes.ok ? (await pendRes.json()).challenges ?? [] : [];
    const expired = expRes.ok ? (await expRes.json()).expired ?? [] : [];
    return NextResponse.json({ challenges, expired });
  } catch {
    return NextResponse.json({ challenges: [], expired: [] });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const account = session?.user?.accountName as string | undefined;
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const action = body.action;
  if (!Number.isInteger(id) || (action !== "approve" && action !== "deny")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${CORE_API_URL}/withdrawal_challenge/${id}/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": CORE_ADMIN_KEY },
        // The account is the session's own — Core scopes the action to it.
        body: JSON.stringify({ account }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail || "failed" },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
