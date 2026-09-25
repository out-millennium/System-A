import * as otplib from "otplib";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/* TOTP (time-based one-time password) helpers for two-factor auth.
   Uses otplib v13 (top-level async functions) for secret generation and code
   verification, plus bcrypt-hashed one-time recovery codes as a backup. */

export function generateSecret(): string {
  return otplib.generateSecret();
}

/** otpauth:// URI used to render the setup QR code. */
export function otpauthURL(accountLabel: string, secret: string): string {
  return otplib.generateURI({
    secret,
    label: accountLabel,
    issuer: "System A",
  });
}

/** Verify a 6-digit TOTP code against a secret (allows small clock drift). */
export async function verifyToken(
  token: string,
  secret: string
): Promise<boolean> {
  try {
    const result = await otplib.verify({
      token: token.replace(/\s/g, ""),
      secret,
      epochTolerance: 30, // allow ±1 time step of clock drift
    });
    return Boolean((result as { valid?: boolean }).valid);
  } catch {
    return false;
  }
}

/** Generate N human-friendly recovery codes (raw) + their bcrypt hashes. */
export async function generateRecoveryCodes(
  count = 8
): Promise<{ raw: string[]; hashes: string[] }> {
  const raw: string[] = [];
  for (let i = 0; i < count; i++) {
    const hex = crypto.randomBytes(5).toString("hex");
    raw.push(`${hex.slice(0, 5)}-${hex.slice(5, 10)}`);
  }
  const hashes = await Promise.all(raw.map((c) => bcrypt.hash(c, 10)));
  return { raw, hashes };
}

/** Check a recovery code against stored hashes; returns matched index or -1. */
export async function matchRecoveryCode(
  code: string,
  hashes: string[]
): Promise<number> {
  const clean = code.trim().toLowerCase();
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(clean, hashes[i])) return i;
  }
  return -1;
}
