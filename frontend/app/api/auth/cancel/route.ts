import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/* Cancel account creation from the onboarding step.
   Deletes the PENDING account (and its linked sign-in methods, via cascade)
   for the currently signed-in user. Only allowed while the account is not yet
   onboarded — a completed account must be managed/deleted elsewhere. The client
   then signs out. */
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) {
    // Nothing to clean up.
    return NextResponse.json({ ok: true });
  }
  if (me.onboarded) {
    // Don't allow deleting a fully-created account through this endpoint.
    return NextResponse.json({ error: "already_onboarded" }, { status: 400 });
  }

  // Cascades remove LinkedAccount / reset tokens / sessions / events.
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
