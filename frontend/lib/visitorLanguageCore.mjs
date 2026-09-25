import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const LOCAL_FALLBACK_IP = "local-development-client";

function firstForwardedIp(value) {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

export function extractVisitorIp({ realIp, forwardedFor, nodeEnv } = {}) {
  // nginx sets x-real-ip from $remote_addr and overwrites the forwarded chain.
  // Prefer it; use the first forwarded address only as a compatibility fallback.
  const real = realIp?.trim();
  if (real && isIP(real)) return real;
  const forwarded = firstForwardedIp(forwardedFor ?? null);
  if (forwarded && isIP(forwarded)) return forwarded;
  // In local development a direct browser request has no client-IP header.
  // Treat localhost as one local visitor, while never inventing a production IP.
  return nodeEnv === "production" ? null : LOCAL_FALLBACK_IP;
}

export function hashVisitorIp(ip, secret = "") {
  if (!secret || !ip) return null;
  return createHmac("sha256", secret).update(ip).digest("hex");
}
