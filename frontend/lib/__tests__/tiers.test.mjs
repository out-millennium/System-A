/* Unit tests for the admin-hierarchy review rules.
   Run with:  node --test

   Node's test runner has no TypeScript toolchain here, so — exactly like
   email.test.mjs — we inline a mirror of the pure functions from lib/tiers.ts
   and keep it in sync with the source. */

import test from "node:test";
import assert from "node:assert/strict";

// ---- inline mirror of lib/tiers.ts (keep in sync) -------------------------
function canReviewRequest(reviewerLevel, requesterLevel) {
  if (reviewerLevel === 4) return requesterLevel < 4;
  if (reviewerLevel >= 5) return requesterLevel === 4;
  return false;
}

function canReviewAppeal(reviewerLevel, reviewerId, actorLevel, actorId) {
  if (actorId === reviewerId) return false;
  if (actorLevel < reviewerLevel) return true;
  if (actorLevel === 4 && reviewerLevel === 4) return true;
  return false;
}

function canModerate(adminLevel, adminId, target) {
  if (target.id === adminId) return false;
  if (
    target.role === "admin" &&
    target.adminLevel != null &&
    target.adminLevel >= adminLevel
  ) {
    return false;
  }
  return true;
}
// ---------------------------------------------------------------------------

test("canReviewRequest: level 4 handles requests below level 4", () => {
  assert.equal(canReviewRequest(4, 1), true);
  assert.equal(canReviewRequest(4, 3), true);
  assert.equal(canReviewRequest(4, 4), false); // a level-4 request is NOT for a peer
  assert.equal(canReviewRequest(4, 5), false);
});

test("canReviewRequest: creator handles level-4 requests only", () => {
  assert.equal(canReviewRequest(5, 4), true);
  assert.equal(canReviewRequest(5, 3), false);
  assert.equal(canReviewRequest(5, 1), false);
});

test("canReviewRequest: below level 4 can review nothing", () => {
  for (const lvl of [1, 2, 3]) {
    for (const req of [1, 2, 3, 4]) {
      assert.equal(canReviewRequest(lvl, req), false);
    }
  }
});

test("canReviewAppeal: strictly above the punisher", () => {
  assert.equal(canReviewAppeal(4, "A", 2, "B"), true); // 4 reviews a lvl-2 action
  assert.equal(canReviewAppeal(5, "A", 4, "B"), true); // creator reviews a lvl-4 action
  assert.equal(canReviewAppeal(3, "A", 3, "B"), false); // not above
});

test("canReviewAppeal: level-4 peer review, but never your own action", () => {
  assert.equal(canReviewAppeal(4, "A", 4, "B"), true); // another lvl-4 may review
  assert.equal(canReviewAppeal(4, "A", 4, "A"), false); // not your own action
});

test("canReviewAppeal: never review your own action even if 'above'", () => {
  assert.equal(canReviewAppeal(5, "A", 4, "A"), false);
});

test("canModerate: never self", () => {
  assert.equal(
    canModerate(5, "A", { id: "A", role: "admin", adminLevel: 5 }),
    false
  );
});

test("canModerate: regular users and strictly-lower admins only", () => {
  assert.equal(
    canModerate(4, "A", { id: "B", role: "user", adminLevel: null }),
    true
  );
  assert.equal(
    canModerate(4, "A", { id: "B", role: "admin", adminLevel: 3 }),
    true
  );
  assert.equal(
    canModerate(4, "A", { id: "B", role: "admin", adminLevel: 4 }),
    false // same level
  );
  assert.equal(
    canModerate(4, "A", { id: "B", role: "admin", adminLevel: 5 }),
    false // higher level
  );
});
