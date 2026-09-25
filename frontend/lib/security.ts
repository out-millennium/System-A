import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

/* Append a security event to the account's audit log. Best-effort: never throws
   into the caller (auditing must not break the primary action). */
export type SecurityEventType =
  | "sign_in"
  | "sign_out"
  | "password_changed"
  | "password_reset"
  | "method_linked"
  | "method_unlinked"
  | "twofa_enabled"
  | "twofa_disabled"
  | "session_revoked"
  | "sessions_revoked_all";

export async function logSecurityEvent(
  userId: string,
  type: SecurityEventType,
  opts?: { meta?: Record<string, unknown>; ip?: string; userAgent?: string }
): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        userId,
        type,
        meta: opts?.meta ? JSON.stringify(opts.meta) : null,
        ip: opts?.ip ?? null,
        userAgent: opts?.userAgent ?? null,
      },
    });
  } catch {
    /* auditing is best-effort */
  }
}

/** Read client IP + user-agent from the incoming request headers (server side). */
export async function clientInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const userAgent = h.get("user-agent") || null;
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}
