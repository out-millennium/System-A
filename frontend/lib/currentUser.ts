import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Read the authenticated user and the Core key only on the server. The key is
 * deliberately fetched from Prisma instead of being placed in the NextAuth JWT
 * or browser-visible session object.
 */
export async function getCurrentUserWithApiKey() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, accountName: true, apiKey: true, onboarded: true },
  });
  if (!user) return null;
  return { session, user };
}
