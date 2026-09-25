/* Small shared helpers for handling free-text input from API request bodies.

   Several endpoints accept free text (moderation reasons, messages,
   announcements, admin-application reasons, appeals). Without an upper bound,
   an adversarial (or buggy) client could POST megabytes of text straight into
   the database — storage bloat and a cheap abuse vector. `boundedText` trims,
   coerces non-strings to empty, and hard-caps the length. */

/** Default cap for short free-text fields (reasons, notes). */
export const MAX_REASON = 1000;
/** Cap for longer bodies (messages, announcements). */
export const MAX_BODY = 4000;

/** Coerce an unknown JSON value to a trimmed string capped at `max` chars.
    Non-strings become "". Never throws. */
export function boundedText(value: unknown, max: number = MAX_REASON): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
