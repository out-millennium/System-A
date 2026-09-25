import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCreator } from "@/lib/admin";
import { verifyOwnPassword } from "@/lib/auth";

/* Creator-only actions (level 5). Body: { identifier, action, ... }
   • setRole  { level: 1..4 | 0 }  — 0 removes admin (back to user); 1..4 grants
     an admin level. Cannot target the creator or self; cannot grant level 5.
   • revokeKey                       — revoke the target's Core API key.
   • deleteAccount                   — permanently delete the target account. */

const CORE_API_URL = process.env.CORE_API_URL!;
const CORE_ADMIN_KEY = process.env.CORE_ADMIN_KEY!;

export async function POST(req: NextRequest) {
  const creator = await getCreator();
  if (!creator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const identifier: string = body.identifier?.trim?.() ?? "";
  const action: string = body.action;
  if (!identifier) {
    return NextResponse.json({ error: "identifier_required" }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { OR: [{ accountName: identifier }, { email: identifier }] },
    select: { id: true, adminLevel: true, apiKey: true, accountName: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  if (target.id === creator.id) {
    return NextResponse.json({ error: "cannot_self" }, { status: 403 });
  }
  // Never touch another creator (there is only one, but guard anyway).
  if (target.adminLevel === 5) {
    return NextResponse.json({ error: "cannot_creator" }, { status: 403 });
  }

  if (action === "setRole") {
    const level = Number(body.level);
    if (![0, 1, 2, 3, 4].includes(level)) {
      return NextResponse.json({ error: "invalid_level" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: target.id },
      data:
        level === 0
          ? { role: "user", adminLevel: null }
          : { role: "admin", adminLevel: level },
    });
    await writeAudit(creator, "creator.setRole", target, `level=${level}`);
    return NextResponse.json({ ok: true });
  }

  if (action === "revokeKey") {
    // Confirm this sensitive action with the CREATOR's own account password.
    if (!(await verifyOwnPassword(creator.id, typeof body.password === "string" ? body.password : ""))) {
      return NextResponse.json({ error: "invalid_password" }, { status: 400 });
    }
    if (!target.apiKey) {
      return NextResponse.json({ error: "no_key" }, { status: 400 });
    }
    const res = await fetch(`${CORE_API_URL}/account/api_key`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-admin-key": CORE_ADMIN_KEY },
      body: JSON.stringify({ api_key: target.apiKey }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return NextResponse.json({ error: d.detail || "revoke_failed" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: target.id },
      data: { apiKey: null },
    });
    await writeAudit(creator, "creator.revokeKey", target, null);
    return NextResponse.json({ ok: true });
  }

  if (action === "deleteAccount") {
    // Audit BEFORE deletion so the target's name is still available.
    await writeAudit(creator, "creator.deleteAccount", target, null);
    await prisma.user.delete({ where: { id: target.id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}

/* Record a creator action in the append-only audit log. Target identity is
   stored as a string so the entry survives account deletion. */
async function writeAudit(
  actor: { id: string; accountName: string | null },
  action: string,
  target: { accountName: string | null; email: string | null },
  detail: string | null
) {
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.accountName,
      action,
      targetName: target.accountName ?? target.email,
      detail,
    },
  });
}
