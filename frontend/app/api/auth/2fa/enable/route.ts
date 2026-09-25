import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyToken, generateRecoveryCodes } from "@/lib/totp";
import { logSecurityEvent } from "@/lib/security";

/* Finish 2FA setup: verify the first code against the pending secret, enable
   2FA, and return one-time recovery codes (shown to the user only now). */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { token } = await req.json();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || !me.totpSecret) {
    return NextResponse.json({ error: "no_pending_setup" }, { status: 400 });
  }
  if (me.totpEnabled) {
    return NextResponse.json({ error: "already_enabled" }, { status: 400 });
  }
  if (!token || !(await verifyToken(String(token), me.totpSecret))) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const { raw, hashes } = await generateRecoveryCodes();
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpEnabled: true,
      totpRecovery: JSON.stringify(hashes),
    },
  });

  await logSecurityEvent(userId, "twofa_enabled");

  return NextResponse.json({ ok: true, recoveryCodes: raw });
}
