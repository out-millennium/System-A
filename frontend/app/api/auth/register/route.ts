import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateEmail } from "@/lib/email";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { mailAvailable } from "@/lib/mail";

/* Email sign-up. Creates a PENDING account (email + password stored, no
   account name / Core account yet). The client then signs the user in and
   routes them to onboarding, where they can link Google/GitHub and choose an
   account name; the Core account is provisioned at /api/auth/complete. */
export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "register"), 8, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  // Email/password sign-up requires verification email delivery. If this
  // deployment cannot send mail, refuse this path server-side (defence in depth)
  // — the UI also disables it and points users to platform sign-in.
  if (!mailAvailable()) {
    return NextResponse.json({ error: "mail_unavailable" }, { status: 503 });
  }

  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 }
    );
  }

  if (validateEmail(email) !== null) {
    return NextResponse.json(
      { error: "invalid_email" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Email or account name already taken" },
      { status: 400 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      onboarded: false,
      accounts: {
        // A temporary credentials link; a stable one is written at /complete.
        create: {
          provider: "credentials",
          providerAccountId: `pending:${email}`,
          email,
        },
      },
    },
  });

  return NextResponse.json({ ok: true });
}
