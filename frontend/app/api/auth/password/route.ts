import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logSecurityEvent } from "@/lib/security";
import { validatePassword } from "@/lib/email";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "password-change"), 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  }
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword) {
    return NextResponse.json({ error: "current_required" }, { status: 400 });
  }
  if (validatePassword(newPassword) !== null) {
    return NextResponse.json({ error: "invalid_password" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!user.password) return NextResponse.json({ error: "current_incorrect" }, { status: 400 });

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return NextResponse.json({ error: "current_incorrect" }, { status: 400 });

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
  await logSecurityEvent(user.id, "password_changed");
  return NextResponse.json({ ok: true });
}
