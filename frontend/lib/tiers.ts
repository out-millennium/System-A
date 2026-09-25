/* Pure, DB-free helpers encoding the admin hierarchy / review rules. Kept
   separate so they can be unit-tested without a database or a browser. */

/* Who may REVIEW a deletion / key-revocation REQUEST.
   A request from a level-<4 admin is handled by level 4; a request from a
   level-4 admin is handled by the creator (level 5). */
export function canReviewRequest(
  reviewerLevel: number,
  requesterLevel: number
): boolean {
  if (reviewerLevel === 4) return requesterLevel < 4;
  if (reviewerLevel >= 5) return requesterLevel === 4;
  return false;
}

/* Who may REVIEW a ban/mute APPEAL.
   Strictly above the punisher's level, WITH one exception: a punishment issued
   by a level-4 admin may also be handled by ANOTHER level-4 admin (not the
   issuer). An admin can never review their own action. */
export function canReviewAppeal(
  reviewerLevel: number,
  reviewerId: string,
  actorLevel: number,
  actorId: string
): boolean {
  if (actorId === reviewerId) return false;
  if (actorLevel < reviewerLevel) return true;
  if (actorLevel === 4 && reviewerLevel === 4) return true;
  return false;
}

/* Whether `admin` (level) may MODERATE `target`.
   Regular users and STRICTLY lower-level admins only; never self. */
export function canModerate(
  adminLevel: number,
  adminId: string,
  target: { id: string; role: string; adminLevel: number | null }
): boolean {
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
