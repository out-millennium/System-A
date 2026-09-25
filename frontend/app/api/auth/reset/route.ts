import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validatePassword } from "@/lib/email";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { logSecurityEvent } from "@/lib/security";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/* Complete a password reset: verify the token, set the new password, and
   consume the token so it can't be reused. Returns machine-friendly error
   codes that the client translates. */
export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "reset"), 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { token, password } = await req.json();

  if (!token) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  if (validatePassword(password) !== null) {
    return NextResponse.json({ error: "invalid_password" }, { status: 400 });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { password: hashed },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await logSecurityEvent(record.userId, "password_reset");

  return NextResponse.json({ ok: true });
}
