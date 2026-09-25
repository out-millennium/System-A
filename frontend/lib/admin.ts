import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRestricted } from "@/lib/moderation";

/* Server-side admin resolver. Always reads role/level from the DB (never trusts
   the client) and returns null for non-admins. Use in every admin API route. */
export type AdminCtx = {
  id: string;
  accountName: string | null;
  level: number;
};

export async function getAdmin(): Promise<AdminCtx | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id as string | undefined;
  if (!id) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { accountName: true, role: true, adminLevel: true },
  });
  if (!user || user.role !== "admin" || !user.adminLevel) return null;

  return { id, accountName: user.accountName, level: user.adminLevel };
}

/** Resolve the creator (level 5) or null. Use for creator-only endpoints. */
export async function getCreator(): Promise<AdminCtx | null> {
  const admin = await getAdmin();
  if (!admin || admin.level < 5) return null;
  return admin;
}

/* Resolve an admin who is allowed to PERFORM actions right now — i.e. an admin
   who is not banned/muted. Use in admin write endpoints (POST/PATCH) so a muted
   admin cannot act even by calling the API directly. Reading endpoints may keep
   using getAdmin so a muted admin can still view. */
export async function getActiveAdmin(): Promise<AdminCtx | null> {
  const admin = await getAdmin();
  if (!admin) return null;
  if (await isRestricted(admin.id)) return null;
  return admin;
}
