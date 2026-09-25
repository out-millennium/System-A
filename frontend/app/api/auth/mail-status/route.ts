import { NextResponse } from "next/server";
import { mailAvailable } from "@/lib/mail";

/* Public status: can this deployment deliver email?

   Register (email/password), password reset and email verification depend on
   being able to send mail. When SMTP is not configured, the deployment truly
   cannot send email, so the client disables those flows and explains why. This
   reflects real capability (see lib/mail.ts mailAvailable), not a cosmetic flag.
   GET /api/auth/mail-status -> { available: boolean } */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ available: mailAvailable() });
}
