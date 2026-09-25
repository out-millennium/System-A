import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/* Create the single creator account "system_admin" (adminLevel 5).
   Protected by the admin key. Fails if a level-5 admin already exists — there
   can be exactly one creator.

   Body: { "email": "...", "password": "..." }
   The creator gets a Core account (balance/api key) like any other account. */

const ADMIN_KEY = process.env.CORE_ADMIN_KEY;
const CORE_API_URL = process.env.CORE_API_URL!;

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-admin-key");
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return NextResponse.json({ error: "admin_key_required" }, { status: 403 });
  }

  // Exactly one creator allowed.
  const existing = await prisma.user.findFirst({ where: { adminLevel: 5 } });
  if (existing) {
    return NextResponse.json({ error: "creator_exists" }, { status: 400 });
  }
  const nameTaken = await prisma.user.findUnique({
    where: { accountName: "system_admin" },
  });
  if (nameTaken) {
    return NextResponse.json({ error: "name_taken" }, { status: 400 });
  }

  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json(
      { error: "email_and_password_required" },
      { status: 400 }
    );
  }

  // Provision the Core account.
  const coreRes = await fetch(`${CORE_API_URL}/account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "system_admin" }),
  });
  if (!coreRes.ok) {
    const err = await coreRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: err.detail || "core_account_failed" },
      { status: 400 }
    );
  }
  const { api_key } = await coreRes.json();

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      accountName: "system_admin",
      apiKey: api_key,
      onboarded: true,
      role: "admin",
      adminLevel: 5,
    },
    select: { id: true, accountName: true },
  });

  return NextResponse.json({ ok: true, account: user.accountName });
}
