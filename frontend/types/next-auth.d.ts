/* Module augmentation for NextAuth: give `session.user` and the JWT the extra
   fields System A stores, so routes/components read them WITHOUT `as any`. Keep
   this in sync with the jwt()/session() callbacks in lib/auth.ts. */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string | null;
      accountName: string | null;
      onboarded: boolean;
      role: string;
      adminLevel: number | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    sid?: string;
    accountName?: string | null;
    onboarded?: boolean;
    email?: string | null;
    role?: string;
    adminLevel?: number | null;
  }
}
