import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/totp";
import { logSecurityEvent } from "@/lib/security";

/* Disable 2FA. Requires a valid current TOTP code to prove possession of the
   authenticator, then clears all 2FA state. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { token } = await req.json();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || !me.totpEnabled || !me.totpSecret) {
    return NextResponse.json({ error: "not_enabled" }, { status: 400 });
  }
  if (!token || !(await verifyToken(String(token), me.totpSecret))) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, totpRecovery: null },
  });

  await logSecurityEvent(userId, "twofa_disabled");

  return NextResponse.json({ ok: true });
}
