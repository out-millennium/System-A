import { log } from "@/lib/logger";
/* ============================================================================
   Outgoing email.

   The project has no SMTP configured, so this runs in DEV-FALLBACK mode: the
   message (e.g. a password-reset link) is written to the server log instead of
   being sent. To enable real delivery later, implement `sendMail` with an SMTP
   client (e.g. nodemailer) guarded by env vars — the call sites won't change.
   ========================================================================= */

type MailInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail({ to, subject, text }: MailInput): Promise<void> {
  // Real delivery when SMTP is configured (see sendViaSmtp); otherwise fall back
  // to logging the message so it can be used during local testing. The log is
  // suppressed in production to avoid leaking message contents to server logs.
  if (isSmtpConfigured()) {
    await sendViaSmtp({ to, subject, text });
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    log.info(
      [
        "──────────────────────────────────────────────",
        "[mail:dev] Email NOT sent (no SMTP configured).",
        `[mail:dev] To:      ${to}`,
        `[mail:dev] Subject: ${subject}`,
        `[mail:dev] Body:`,
        text,
        "──────────────────────────────────────────────",
      ].join("\n")
    );
  }
}

/* ----------------------------------------------------------------------------
   Optional SMTP delivery.

   Enabled only when SMTP_* env vars are present, so existing dev setups keep
   working unchanged. Uses `nodemailer` if it is installed; if the env vars are
   set but the package is missing, it degrades gracefully (logs a warning in dev
   and does not throw, so auth flows never break on a mail hiccup).
   Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE. */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

async function sendViaSmtp({ to, subject, text }: MailInput): Promise<void> {
  try {
    // Dynamic import so the dependency is optional at build/runtime. The module
    // name is built at runtime so the TypeScript compiler does not require the
    // (optional) 'nodemailer' types to be installed.
    const pkg = ["node", "mailer"].join("");
    const mod: any = await import(/* webpackIgnore: true */ pkg).catch(
      () => null
    );
    if (!mod) {
      if (process.env.NODE_ENV !== "production") {
        log.warn("[mail] SMTP configured but 'nodemailer' is not installed.");
      }
      return;
    }
    const nodemailer = mod.default ?? mod;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });
  } catch (e) {
    // Never let a mail failure break the calling auth/moderation flow.
    if (process.env.NODE_ENV !== "production") {
      log.warn("[mail] SMTP send failed:", (e as Error).message);
    }
  }
}

/** Build the absolute URL for a password-reset link. */
export function resetLink(token: string): string {
  const base = process.env.NEXTAUTH_URL || "http://localhost";
  return `${base}/reset?token=${encodeURIComponent(token)}`;
}

/* ----------------------------------------------------------------------------
   Mail availability (single source of truth for the UI).

   Email flows (email/password REGISTER, password RESET, email verification)
   only make sense if we can actually deliver mail. That is true ONLY when SMTP
   is configured. When it isn't, the deployment genuinely cannot send email, so
   the UI must disable those flows and say so — this is derived from real
   capability (isSmtpConfigured), not a hardcoded flag. An operator can force it
   off explicitly with MAIL_DISABLED=true (e.g. known-broken provider). */
export function mailAvailable(): boolean {
  if (process.env.MAIL_DISABLED === "true") return false;
  return isSmtpConfigured();
}

