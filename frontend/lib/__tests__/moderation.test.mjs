/* Unit tests for the live ban/mute status computation.
   Run with:  node --test

   Inline mirror of computeStatus() from lib/moderation.ts (kept in sync),
   since node --test has no TypeScript toolchain here. */

import test from "node:test";
import assert from "node:assert/strict";

// ---- inline mirror of lib/moderation.ts computeStatus (keep in sync) -------
function evaluate(at, until, reason) {
  if (!at) return { active: false, permanent: false, reason: null, until: null };
  if (until && until.getTime() <= Date.now()) {
    return { active: false, permanent: false, reason: null, until: null };
  }
  return {
    active: true,
    permanent: until === null,
    reason: reason ?? null,
    until: until ? until.toISOString() : null,
  };
}

function computeStatus(u) {
  const banned = evaluate(u.bannedAt, u.bannedUntil, u.banReason);
  let muted = evaluate(u.mutedAt, u.mutedUntil, u.muteReason);
  if (!muted.active && u.adminMutedUntil) {
    if (u.adminMutedUntil.getTime() > Date.now()) {
      muted = {
        active: true,
        permanent: false,
        reason: u.adminMuteReason ?? null,
        until: u.adminMutedUntil.toISOString(),
      };
    }
  }
  return { banned, muted };
}
// ---------------------------------------------------------------------------

const future = () => new Date(Date.now() + 60 * 60 * 1000);
const past = () => new Date(Date.now() - 60 * 60 * 1000);
const blank = {
  bannedAt: null,
  bannedUntil: null,
  banReason: null,
  mutedAt: null,
  mutedUntil: null,
  muteReason: null,
  adminMutedUntil: null,
  adminMuteReason: null,
};

test("clean account has no active restrictions", () => {
  const s = computeStatus({ ...blank });
  assert.equal(s.banned.active, false);
  assert.equal(s.muted.active, false);
});

test("permanent ban (no until) is active and permanent", () => {
  const s = computeStatus({ ...blank, bannedAt: new Date(), bannedUntil: null, banReason: "x" });
  assert.equal(s.banned.active, true);
  assert.equal(s.banned.permanent, true);
});

test("timed ban in the future is active, in the past is expired", () => {
  const active = computeStatus({ ...blank, bannedAt: new Date(), bannedUntil: future() });
  assert.equal(active.banned.active, true);
  assert.equal(active.banned.permanent, false);

  const expired = computeStatus({ ...blank, bannedAt: new Date(), bannedUntil: past() });
  assert.equal(expired.banned.active, false);
});

test("expired mute is not active", () => {
  const s = computeStatus({ ...blank, mutedAt: new Date(), mutedUntil: past(), muteReason: "x" });
  assert.equal(s.muted.active, false);
});

test("admin-mute (warnings) folds in as a mute when not already muted", () => {
  const s = computeStatus({ ...blank, adminMutedUntil: future(), adminMuteReason: "3rd warning" });
  assert.equal(s.muted.active, true);
  assert.equal(s.muted.permanent, false);
  assert.equal(s.muted.reason, "3rd warning");
});

test("expired admin-mute does not fold in (slate can be wiped)", () => {
  const s = computeStatus({ ...blank, adminMutedUntil: past(), adminMuteReason: "old" });
  assert.equal(s.muted.active, false);
});

test("a real mute takes precedence over admin-mute", () => {
  const s = computeStatus({
    ...blank,
    mutedAt: new Date(),
    mutedUntil: null, // permanent real mute
    muteReason: "manual",
    adminMutedUntil: future(),
    adminMuteReason: "warning",
  });
  assert.equal(s.muted.active, true);
  assert.equal(s.muted.permanent, true);
  assert.equal(s.muted.reason, "manual");
});
