import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { extractVisitorIp, hashVisitorIp } from "./visitorLanguageCore.mjs";

/*
 * First-visit language gate.
 *
 * The browser cannot reliably decide whether another browser has already visited
 * from the same IP. This server helper stores only a keyed HMAC of the client IP,
 * never the raw address. The reverse proxy must overwrite x-real-ip and
 * x-forwarded-for; direct public exposure of the Next.js process would defeat
 * that trust boundary.
 */
const IP_HASH_SECRET =
  process.env.VISITOR_IP_HASH_SECRET || process.env.NEXTAUTH_SECRET || "";

/**
 * Register the current visitor and return whether the language prompt may show.
 * `null` means the server gate could not be evaluated; the client can then use
 * its existing localStorage/cookie fallback without blocking the public landing.
 */
export async function registerVisitorLanguageVisit(): Promise<boolean | null> {
  try {
    const h = await headers();
    const ip = extractVisitorIp({
      realIp: h.get("x-real-ip"),
      forwardedFor: h.get("x-forwarded-for"),
      nodeEnv: process.env.NODE_ENV,
    });
    const ipHash = ip ? hashVisitorIp(ip, IP_HASH_SECRET) : null;
    if (!ipHash) return null;

    const existing = await prisma.visitorLanguageVisit.findUnique({
      where: { ipHash },
      select: { id: true },
    });
    if (existing) {
      await prisma.visitorLanguageVisit.update({
        where: { ipHash },
        data: { lastSeenAt: new Date() },
      });
      return false;
    }

    try {
      await prisma.visitorLanguageVisit.create({
        data: { ipHash, lastSeenAt: new Date() },
      });
      return true;
    } catch (error) {
      // Two tabs can arrive together. A unique race means another request has
      // already registered this IP, so do not show the prompt twice.
      if ((error as { code?: string })?.code === "P2002") return false;
      throw error;
    }
  } catch (error) {
    // A DB outage must not take down the public landing. Return null so the
    // component falls back to its local browser marker and the error is logged
    // by the server/runtime rather than exposed to the visitor.
    const message = error instanceof Error ? error.message : String(error);
    console.warn("visitor language gate unavailable:", message);
    return null;
  }
}
