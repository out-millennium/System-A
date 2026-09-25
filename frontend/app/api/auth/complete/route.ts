import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateEmail } from "@/lib/email";
import { containsReservedAdmin } from "@/lib/adminName";
import { isRestricted } from "@/lib/moderation";

const CORE_API_URL = process.env.CORE_API_URL!;

/* Completes onboarding for the currently signed-in (pending) account:
   sets the account name + password, provisions the Core account, records the
   credentials sign-in method, and marks the account as onboarded. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (await isRestricted(userId)) {
    return NextResponse.json({ error: "restricted" }, { status: 403 });
  }

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (me.onboarded) {
    return NextResponse.json({ error: "Already completed" }, { status: 400 });
  }

  const { accountName, password, email } = await req.json();

  // A password is required only when the account does not already have one
  // (OAuth-first accounts). Email sign-ups set their password at registration,
  // so the onboarding step does not ask for it again.
  const needsPassword = !me.password;

  if (!accountName || (needsPassword && !password)) {
    return NextResponse.json(
      { error: "Account name and password required" },
      { status: 400 }
    );
  }

  // Regular users cannot take an admin-looking name (any form of "admin").
  if (containsReservedAdmin(accountName)) {
    return NextResponse.json({ error: "name_reserved" }, { status: 400 });
  }

  // Validate the email only when one is provided/changed here.
  if (email && validateEmail(email) !== null) {
    return NextResponse.json(
      { error: "invalid_email" },
      { status: 400 }
    );
  }

  // Uniqueness of accountName (and email, if provided/changed).
  const clash = await prisma.user.findFirst({
    where: {
      AND: [
        { id: { not: me.id } },
        {
          OR: [
            { accountName },
            ...(email ? [{ email }] : []),
          ],
        },
      ],
    },
  });
  if (clash) {
    return NextResponse.json(
      { error: "Email or account name already taken" },
      { status: 400 }
    );
  }

  // Provision the Core account (one Core account per System A account).
  const coreRes = await fetch(`${CORE_API_URL}/account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: accountName }),
  });
  if (!coreRes.ok) {
    const err = await coreRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: err.detail || "Core account creation failed" },
      { status: 400 }
    );
  }
  const { api_key } = await coreRes.json();

  await prisma.user.update({
    where: { id: me.id },
    data: {
      accountName,
      // Keep the existing password for email sign-ups; set a fresh hash only
      // when the account is being given a password for the first time.
      ...(needsPassword ? { password: await bcrypt.hash(password, 12) } : {}),
      apiKey: api_key,
      onboarded: true,
      ...(email ? { email } : {}),
    },
  });

  // Ensure a credentials sign-in method is recorded for this account.
  const hasCredentials = await prisma.linkedAccount.findFirst({
    where: { userId: me.id, provider: "credentials" },
  });
  if (!hasCredentials) {
    await prisma.linkedAccount.create({
      data: {
        userId: me.id,
        provider: "credentials",
        providerAccountId: me.id, // unique per account
        email: email || me.email || null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
