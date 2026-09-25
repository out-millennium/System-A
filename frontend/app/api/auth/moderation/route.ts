import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getModerationStatus } from "@/lib/moderation";

/* The current user's live ban/mute status (for dialogs + disabled actions). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const status = await getModerationStatus(userId);
  if (!status) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(status);
}
