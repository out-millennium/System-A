import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSecret, otpauthURL } from "@/lib/totp";
import QRCode from "qrcode";

/* Begin 2FA setup: generate a fresh secret, store it (not yet enabled), and
   return the otpauth URL + a QR data-URL for the authenticator app. */
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (me.totpEnabled) {
    return NextResponse.json({ error: "already_enabled" }, { status: 400 });
  }

  const secret = generateSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: secret },
  });

  const label = me.accountName || me.email || me.id;
  const url = otpauthURL(label, secret);
  const qr = await QRCode.toDataURL(url);

  return NextResponse.json({ secret, otpauthUrl: url, qr });
}
