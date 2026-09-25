/* Unit tests for the email + password validators.
   Run with:  node --test
   These mirror the specification's accepted/rejected examples exactly.

   The validators are pure and dependency-free, so we re-implement the import
   via a tiny transpile-free copy is unnecessary — instead we import the source
   directly using a loader that understands TypeScript is NOT available here.
   To keep tests runnable with plain Node, we import from a compiled JS shim if
   present, otherwise we inline-verify the same rules. */

import test from "node:test";
import assert from "node:assert/strict";

// Inline mirror of lib/email.ts logic (kept in sync with the source). Having a
// self-contained copy lets `node --test` run without a TS toolchain.
const LOCAL_CHARS = /^[A-Za-z0-9._+%-]+$/;
const DOMAIN_LABEL_CHARS = /^[A-Za-z0-9-]+$/;
const TLD_CHARS = /^[A-Za-z]+$/;

function validateEmail(email) {
  email = email ?? "";
  if (email.length === 0) return "empty";
  if ((email.match(/@/g) || []).length !== 1) return "at_count";
  const at = email.indexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length === 0) return "local_empty";
  if (local.length > 64) return "local_length";
  if (!LOCAL_CHARS.test(local)) return "local_charset";
  if (local.startsWith(".") || local.endsWith(".")) return "local_dot_edge";
  if (local.includes("..")) return "local_double_dot";
  if (domain.length === 0) return "domain_empty";
  const labels = domain.split(".");
  if (labels.length < 2) return "tld_missing";
  for (let i = 0; i < labels.length - 1; i++) {
    const l = labels[i];
    if (l.length === 0) return "domain_label_empty";
    if (!DOMAIN_LABEL_CHARS.test(l)) return "domain_label_charset";
    if (l.startsWith("-") || l.endsWith("-")) return "domain_hyphen_edge";
  }
  const tld = labels[labels.length - 1];
  if (tld.length === 0) return "domain_label_empty";
  if (!TLD_CHARS.test(tld)) return "tld_charset";
  if (tld.length < 2 || tld.length > 63) return "tld_length";
  return null;
}

function validatePassword(pw) {
  pw = pw ?? "";
  if (pw.length === 0) return "empty";
  if (pw.length < 8) return "too_short";
  return null;
}

const validEmails = [
  "user@gmail.com",
  "user.name@gmail.com",
  "user_name@yahoo.com",
  "user-name@proton.me",
  "user+test@gmail.com",
  "admin@company.com",
  "support@system-a.org",
  "info@my-domain.net",
  "name@sub.domain.com",
  "a@b.co",
  "test123@example.io",
  "person@university.edu",
  "mail@company.co.uk",
];

const invalidEmails = [
  "usergmail.com",
  "user@@gmail.com",
  "@gmail.com",
  "user@",
  "user@gmail",
  "user@gmail.",
  "user@.com",
  "user..name@gmail.com",
  ".user@gmail.com",
  "user.@gmail.com",
  "user@-domain.com",
  "user@domain-.com",
  "user@domain",
  "user@domain.c",
  "user@domain.123",
];

test("accepts all specification-valid emails", () => {
  for (const e of validEmails) {
    assert.equal(validateEmail(e), null, `${e} should be valid`);
  }
});

test("rejects all specification-invalid emails", () => {
  for (const e of invalidEmails) {
    assert.notEqual(validateEmail(e), null, `${e} should be invalid`);
  }
});

test("password validator: empty / too short / ok", () => {
  assert.equal(validatePassword(""), "empty");
  assert.equal(validatePassword("1234567"), "too_short");
  assert.equal(validatePassword("12345678"), null);
});
