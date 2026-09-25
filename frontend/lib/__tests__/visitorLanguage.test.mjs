import test from "node:test";
import assert from "node:assert/strict";
import { extractVisitorIp, hashVisitorIp } from "../visitorLanguageCore.mjs";

test("visitor IP extraction prefers the trusted reverse-proxy address", () => {
  assert.equal(
    extractVisitorIp({ realIp: "203.0.113.10", forwardedFor: "198.51.100.5", nodeEnv: "production" }),
    "203.0.113.10"
  );
});

test("visitor IP extraction uses the first forwarded address as fallback", () => {
  assert.equal(
    extractVisitorIp({ forwardedFor: "203.0.113.11, 198.51.100.6", nodeEnv: "production" }),
    "203.0.113.11"
  );
});

test("invalid proxy headers do not become visitor identities", () => {
  assert.equal(
    extractVisitorIp({ realIp: "forged", forwardedFor: "also-forged", nodeEnv: "production" }),
    null
  );
});

test("production without a trusted client IP does not invent an identity", () => {
  assert.equal(extractVisitorIp({ nodeEnv: "production" }), null);
});

test("local development has a deterministic fallback identity", () => {
  assert.equal(extractVisitorIp({ nodeEnv: "development" }), "local-development-client");
});

test("visitor identifiers are keyed hashes and never equal the raw IP", () => {
  const a = hashVisitorIp("203.0.113.12", "test-secret");
  const b = hashVisitorIp("203.0.113.12", "test-secret");
  const c = hashVisitorIp("203.0.113.12", "different-secret");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, "203.0.113.12");
  assert.equal(hashVisitorIp("203.0.113.12", ""), null);
});
