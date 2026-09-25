/* ============================================================================
   Email address validation for System A.

   Structure enforced (per spec):

     <local-part>@<second-level-domain>.<top-level-domain>

   Local part (before "@"):
     • required
     • length 1..64
     • allowed: A-Z a-z 0-9 and the symbols . _ - + %
     • must not start or end with a dot
     • must not contain two consecutive dots

   The "@" symbol:
     • must appear exactly once

   Domain part (after "@"):
     • one or more labels separated by dots
     • each label may contain: latin letters, digits, hyphen
     • a label must not start or end with a hyphen
     • labels must be separated by a dot (i.e. no empty label)

   Top-level domain (the last label):
     • latin letters only
     • length 2..63

   validateEmail returns null when the address is valid, otherwise a short
   machine-friendly reason code (also usable as a message key).
   ========================================================================= */

export type EmailError =
  | "empty"
  | "at_count" // "@" must appear exactly once
  | "local_empty"
  | "local_length" // 1..64
  | "local_charset"
  | "local_dot_edge" // starts/ends with a dot
  | "local_double_dot"
  | "domain_empty"
  | "domain_label_empty" // ".." or leading/trailing dot in domain
  | "domain_label_charset"
  | "domain_hyphen_edge" // label starts/ends with "-"
  | "tld_missing" // domain has no dot -> no TLD separation
  | "tld_charset" // TLD must be letters only
  | "tld_length"; // 2..63

const LOCAL_CHARS = /^[A-Za-z0-9._+%-]+$/;
const DOMAIN_LABEL_CHARS = /^[A-Za-z0-9-]+$/;
const TLD_CHARS = /^[A-Za-z]+$/;

/**
 * Validate an email address against the System A specification.
 * @returns `null` if valid, otherwise an {@link EmailError} reason code.
 */
export function validateEmail(input: string): EmailError | null {
  const email = input ?? "";

  if (email.length === 0) return "empty";

  // Exactly one "@".
  const atCount = (email.match(/@/g) || []).length;
  if (atCount !== 1) return "at_count";

  const atIndex = email.indexOf("@");
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  // ---- Local part -------------------------------------------------------
  if (local.length === 0) return "local_empty";
  if (local.length > 64) return "local_length";
  if (!LOCAL_CHARS.test(local)) return "local_charset";
  if (local.startsWith(".") || local.endsWith(".")) return "local_dot_edge";
  if (local.includes("..")) return "local_double_dot";

  // ---- Domain part ------------------------------------------------------
  if (domain.length === 0) return "domain_empty";

  const labels = domain.split(".");

  // A valid domain here needs at least a second-level label AND a TLD, so at
  // least two labels ("domain" + "tld"). One label (no dot) => missing TLD.
  if (labels.length < 2) return "tld_missing";

  // Validate every label except the last (the last is the TLD, checked below).
  for (let i = 0; i < labels.length - 1; i++) {
    const label = labels[i];
    if (label.length === 0) return "domain_label_empty"; // "..", leading dot
    if (!DOMAIN_LABEL_CHARS.test(label)) return "domain_label_charset";
    if (label.startsWith("-") || label.endsWith("-")) {
      return "domain_hyphen_edge";
    }
  }

  // ---- Top-level domain (last label) ------------------------------------
  const tld = labels[labels.length - 1];
  if (tld.length === 0) return "domain_label_empty"; // trailing dot
  if (!TLD_CHARS.test(tld)) return "tld_charset"; // letters only (no digits)
  if (tld.length < 2 || tld.length > 63) return "tld_length";

  return null;
}

/** Convenience boolean wrapper. */
export function isValidEmail(input: string): boolean {
  return validateEmail(input) === null;
}

/* ---------------------------------------------------------------------------
   Password validation. Kept here alongside email so all auth-field checks live
   in one place. Returns null when valid, otherwise a reason code.
   --------------------------------------------------------------------------- */
export type PasswordError = "empty" | "too_short";

export const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(input: string): PasswordError | null {
  const pw = input ?? "";
  if (pw.length === 0) return "empty";
  if (pw.length < MIN_PASSWORD_LENGTH) return "too_short";
  return null;
}
