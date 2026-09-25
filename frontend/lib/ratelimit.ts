/* ============================================================================
   Minimal in-memory rate limiter for auth endpoints.

   Keyed by (bucket + client IP). A fixed window counts attempts and returns
   `false` once the limit is exceeded. This is intentionally simple: the counter
   lives in the process memory and resets on container restart — enough to blunt
   brute-force attempts without external infrastructure. For multi-instance
   deployments, swap the Map for a shared store (Redis) behind the same API.
   ========================================================================= */

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * @param key        unique bucket, e.g. `login:<ip>`
 * @param limit      max attempts per window
 * @param windowMs   window length in ms
 */
export function rateLimit(
  key: string,
  limit = 10,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  return {
    ok: true,
    remaining: limit - entry.count,
    retryAfterSeconds: 0,
  };
}

/** Extract a client key from a request's forwarding headers. */
export function clientKey(req: Request, bucket: string): string {
  const xff = req.headers.get("x-forwarded-for");
  const ip =
    xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `${bucket}:${ip}`;
}
