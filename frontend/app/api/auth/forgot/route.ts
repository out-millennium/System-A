import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, resetLink, mailAvailable } from "@/lib/mail";
import { validateEmail } from "@/lib/email";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import crypto from "crypto";

/* Start a password reset. Always responds with the same success payload
   regardless of whether the email exists — this prevents attackers from
   discovering which emails are registered. A single-use, hashed, expiring
   token is created and the reset link is emailed (dev: logged). */
const TOKEN_TTL_MINUTES = 30;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "forgot"), 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  // Password reset depends on emailing a link. If mail can't be delivered,
  // say so plainly instead of pretending a message was sent.
  if (!mailAvailable()) {
    return NextResponse.json({ error: "mail_unavailable" }, { status: 503 });
  }

  const { email } = await req.json();
  let issuedLink: string | null = null;

  // Basic shape check; we still respond success to avoid enumeration.
  if (email && validateEmail(email) === null) {
    const user = await prisma.user.findUnique({ where: { email } });

    // Only issue a token for accounts that actually have a password
    // (credentials) — OAuth-only accounts have nothing to reset.
    if (user && user.password) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

      // Invalidate any previous outstanding tokens for this user.
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      issuedLink = resetLink(rawToken);
      await sendMail({
        to: email,
        subject: "System A — password reset",
        text:
          `You requested a password reset.\n\n` +
          `Open this link to set a new password (valid for ${TOKEN_TTL_MINUTES} minutes):\n` +
          `${issuedLink}\n\n` +
          `If you did not request this, you can ignore this email.`,
      });
    }
  }

  // Uniform response. In development (no SMTP) also return the reset link so it
  // can be tested without digging through logs. This is gated on NODE_ENV and
  // never present in production builds.
  return NextResponse.json({
    ok: true,
    ...(process.env.NODE_ENV !== "production" && issuedLink
      ? { devLink: issuedLink }
      : {}),
  });
}
