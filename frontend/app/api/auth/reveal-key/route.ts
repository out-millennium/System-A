import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, verifyOwnPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientKey, rateLimit } from "@/lib/ratelimit";

/* Reveal the CURRENT user's own Core API key — password-gated.

   The api_key is a sensitive credential. Users forget it (it's shown once at
   creation), so this lets the owner view it again, but ONLY after re-entering
   their account password. The password is verified here (its bcrypt hash lives
   in this app's DB, never in Core). We return only the caller's OWN stored key,
   never a key supplied by the client. Rate-note: pair with a session; the
   password check itself throttles brute force (bcrypt is slow).
   POST { password } -> { apiKey } | { error } */
export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "reveal-key"), 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  }
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (!(await verifyOwnPassword(userId, password))) {
    return NextResponse.json({ error: "invalid_password" }, { status: 400 });
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiKey: true },
  });
  if (!me?.apiKey) {
    return NextResponse.json({ error: "no_key" }, { status: 400 });
  }
  return NextResponse.json({ apiKey: me.apiKey });
}
