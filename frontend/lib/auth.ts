import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { getToken } from "next-auth/jwt";
import { cookies, headers } from "next/headers";
import { verifyToken, matchRecoveryCode } from "@/lib/totp";
import { logSecurityEvent } from "@/lib/security";
import { isRestricted } from "@/lib/moderation";
import { rateLimit } from "@/lib/ratelimit";

/* ============================================================================
   Authentication for System A.

   One System A account can be reached via several sign-in methods:
   • credentials (email OR account name + password)
   • Google (OAuth)
   • GitHub (OAuth)

   All of them point at ONE User row. Linking is stored in LinkedAccount.
   OAuth sign-in that finds no existing link creates a PENDING user; the
   onboarding page then collects accountName + password and provisions the
   Core account. A signed-in user can attach more providers to the same
   account (used by the "link more methods" step).
   ========================================================================= */

/* Startup diagnostic (server-side, logged once): a missing/short NEXTAUTH_SECRET
   or a missing NEXTAUTH_URL is the usual cause of "every page bounces to /login"
   — the session cookie can't be validated. We only WARN (never throw) so the
   app still boots, but the cause is obvious in `docker compose logs`. */
if (typeof window === "undefined" && !(globalThis as { __saAuthChecked?: boolean }).__saAuthChecked) {
  (globalThis as { __saAuthChecked?: boolean }).__saAuthChecked = true;
  const secret = process.env.NEXTAUTH_SECRET || "";
  if (!secret) {
    console.warn(
      "[auth] NEXTAUTH_SECRET is EMPTY. Sessions cannot be validated and every " +
        "protected page will redirect to /login. Set a stable NEXTAUTH_SECRET " +
        "(e.g. `openssl rand -base64 32`) in your environment."
    );
  } else if (secret.length < 16) {
    console.warn(
      "[auth] NEXTAUTH_SECRET is very short (<16 chars). Use a long random value " +
        "(e.g. `openssl rand -base64 32`) to keep sessions secure and stable."
    );
  }
  if (!process.env.NEXTAUTH_URL) {
    console.warn(
      "[auth] NEXTAUTH_URL is not set. If you open the app on a different " +
        "host/port than NEXTAUTH_URL, the session cookie won't match and pages " +
        "will bounce to /login. Set NEXTAUTH_URL to the URL you actually visit."
    );
  }
}

/* Read the currently signed-in user id from the NextAuth JWT cookie.
   Used so that an OAuth sign-in performed WHILE already logged in links the
   new provider to the existing account instead of creating a new one. */
async function currentUserIdFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    // Reconstruct a minimal request-like object for getToken.
    const token = await getToken({
      req: {
        cookies: Object.fromEntries(
          cookieStore.getAll().map((c) => [c.name, c.value])
        ),
        headers: {},
      } as any,
      secret: process.env.NEXTAUTH_SECRET,
    });
    return (token?.uid as string) || null;
  } catch {
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: false,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: false,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        identifier: { label: "Email or account name", type: "text" },
        password: { label: "Password", type: "password" },
        apiKey: { label: "API key", type: "text" },
        totp: { label: "Authentication code", type: "text" },
      },
      async authorize(credentials) {
        // Rate-limit sign-in attempts per client IP.
        try {
          const h = await headers();
          const ip =
            h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            h.get("x-real-ip") ||
            "unknown";
          const rl = rateLimit(`login:${ip}`, 10, 60_000);
          if (!rl.ok) throw new Error("rate_limited");
        } catch (e) {
          if (e instanceof Error && e.message === "rate_limited") throw e;
        }

        const identifier = credentials?.identifier?.trim();
        const password = credentials?.password;
        const apiKey = credentials?.apiKey?.trim();
        // Need an identifier plus ONE credential: password OR the api_key.
        if (!identifier || (!password && !apiKey)) return null;

        const user = await prisma.user.findFirst({
          where: {
            OR: [{ email: identifier }, { accountName: identifier }],
          },
        });
        if (!user) return null;

        // Authenticate by password OR by the account's own api_key (useful when
        // email delivery is unavailable, so users can't reset a lost password).
        let valid = false;
        if (password && user.password) {
          valid = await bcrypt.compare(password, user.password);
        } else if (apiKey && user.apiKey) {
          const a = Buffer.from(apiKey);
          const b = Buffer.from(user.apiKey);
          valid = a.length === b.length && timingSafeEqual(a, b);
        }
        if (!valid) return null;

        // Second factor, if enabled for this account.
        if (user.totpEnabled && user.totpSecret) {
          const code = (credentials?.totp || "").trim();
          if (!code) {
            // Signal the login UI that a code is required (password was OK).
            throw new Error("2fa_required");
          }
          const okTotp = await verifyToken(code, user.totpSecret);
          let accepted = okTotp;
          // Fall back to a one-time recovery code.
          if (!accepted && user.totpRecovery) {
            try {
              const hashes: string[] = JSON.parse(user.totpRecovery);
              const idx = await matchRecoveryCode(code, hashes);
              if (idx >= 0) {
                accepted = true;
                hashes.splice(idx, 1); // consume it
                await prisma.user.update({
                  where: { id: user.id },
                  data: { totpRecovery: JSON.stringify(hashes) },
                });
              }
            } catch {
              /* ignore malformed recovery store */
            }
          }
          if (!accepted) throw new Error("2fa_invalid");
        }

        return {
          id: user.id,
          email: user.email ?? undefined,
          accountName: user.accountName ?? undefined,
          onboarded: user.onboarded,
        } as any;
      },
    }),
  ],

  callbacks: {
    /* Runs for every sign-in. For OAuth, create/link accounts here. */
    async signIn({ user, account, profile }) {
      try {
        if (!account) return false;

        // Credentials sign-in already validated in authorize().
        if (account.provider === "credentials") return true;

        const provider = account.provider; // "google" | "github"
        const providerAccountId = account.providerAccountId;
        const email =
          (profile as any)?.email || (user as any)?.email || null;

        // Already linked? -> allow, it will resolve to that account.
        const existingLink = await prisma.linkedAccount.findUnique({
          where: {
            provider_providerAccountId: { provider, providerAccountId },
          },
        });
        if (existingLink) return true;

        // Signed in while already authenticated -> link to current account.
        const currentUid = await currentUserIdFromCookie();
        if (currentUid) {
          const me = await prisma.user.findUnique({
            where: { id: currentUid },
          });
          if (me) {
            // Muted/banned users cannot add new sign-in methods.
            if (await isRestricted(me.id)) return false;
            await prisma.linkedAccount.create({
              data: { userId: me.id, provider, providerAccountId, email },
            });
            await logSecurityEvent(me.id, "method_linked", {
              meta: { provider },
            });
            return true;
          }
        }

        // Brand-new OAuth identity -> create a PENDING user + its link.
        await prisma.user.create({
          data: {
            email: email ?? undefined,
            onboarded: false,
            accounts: {
              create: { provider, providerAccountId, email },
            },
          },
        });
        return true;
      } catch (err) {
        // Surface the real reason in the container logs instead of silently
        // bouncing the user back to /login (which looks like "the page just
        // reloads"). The most common cause is a database whose schema is out
        // of date (missing the `onboarded` column or the LinkedAccount table).
        console.error("[auth] signIn callback failed:", err);
        return false;
      }
    },

    async jwt({ token, user, account, trigger }) {
      // On first sign-in, resolve the System A user id.
      if (user && account) {
        if (account.provider === "credentials") {
          token.uid = (user as any).id;
        } else {
          const link = await prisma.linkedAccount.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
          });
          if (link) token.uid = link.userId;
        }

        // Create a tracked session row for this sign-in and record its id in
        // the token, so it can be listed as an active device and revoked.
        if (token.uid) {
          try {
            const h = await headers();
            const ip =
              h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
              h.get("x-real-ip") ||
              null;
            const userAgent = h.get("user-agent") || null;
            const s = await prisma.userSession.create({
              data: { userId: token.uid as string, ip, userAgent },
            });
            token.sid = s.id;
            await logSecurityEvent(token.uid as string, "sign_in", {
              ip: ip ?? undefined,
              userAgent: userAgent ?? undefined,
              meta: { provider: account.provider },
            });
          } catch {
            /* session tracking is best-effort */
          }
        }
      }

      // Reject the token if its session has been revoked/deleted.
      if (token.sid) {
        const s = await prisma.userSession.findUnique({
          where: { id: token.sid as string },
        });
        if (!s || s.revokedAt) {
          // Returning a token without uid effectively signs the user out.
          return {};
        }
      }

      // Always refresh account state from DB (kept small, cached per request).
      if (token.uid) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.uid as string },
        });
        if (dbUser) {
          token.accountName = dbUser.accountName ?? null;
          // The Core API key is never copied into the JWT. Server routes fetch
          // it directly from Prisma when they need to call Core.
          token.onboarded = dbUser.onboarded;
          token.email = dbUser.email ?? null;
          token.role = dbUser.role ?? "user";
          token.adminLevel = dbUser.adminLevel ?? null;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid ?? null;
        session.user.accountName = token.accountName ?? null;
        session.user.onboarded = Boolean(token.onboarded);
        session.user.email = token.email ?? session.user.email ?? null;
        session.user.role = token.role ?? "user";
        session.user.adminLevel = token.adminLevel ?? null;
      }
      return session;
    },
  },

  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
};

/* Verify a user's OWN account password (for sensitive actions like revoking an
   API key). Returns true only if the account has a password set AND it matches.
   Password hashes live here in the frontend (User.password), never in Core —
   so password-gated actions must be enforced in this app. */
export async function verifyOwnPassword(
  userId: string,
  password: string
): Promise<boolean> {
  if (!password || typeof password !== "string") return false;
  const { prisma } = await import("@/lib/prisma");
  const bcrypt = (await import("bcryptjs")).default;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });
  if (!user?.password) return false;
  return bcrypt.compare(password, user.password);
}
