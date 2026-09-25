import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security";

/* Detach a sign-in method (google / github / credentials) from the current
   account. Guards against locking the user out:
   • at least one sign-in method must always remain;
   • the "credentials" method (email + password) may only be removed if the
     account can still be reached another way. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { provider } = await req.json();
  if (provider !== "google" && provider !== "github" && provider !== "credentials") {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }

  const links = await prisma.linkedAccount.findMany({ where: { userId } });

  // Must keep at least one sign-in method.
  const remaining = links.filter((l) => l.provider !== provider);
  if (remaining.length === 0) {
    return NextResponse.json({ error: "last_method" }, { status: 400 });
  }

  // Is this provider actually linked?
  const toRemove = links.filter((l) => l.provider === provider);
  if (toRemove.length === 0) {
    return NextResponse.json({ error: "not_linked" }, { status: 400 });
  }

  await prisma.linkedAccount.deleteMany({ where: { userId, provider } });

  // Removing the credentials method also clears the stored password, so it no
  // longer counts as a way in.
  if (provider === "credentials") {
    await prisma.user.update({
      where: { id: userId },
      data: { password: null },
    });
  }

  await logSecurityEvent(userId, "method_unlinked", { meta: { provider } });

  return NextResponse.json({ ok: true });
}
