import "server-only";

import { createHmac } from "crypto";

const CORE_HMAC_SECRET = process.env.CORE_HMAC_SECRET || "";

/** Add the Core anti-replay signature to a JSON request body. */
export function signedCoreHeaders(body: string, base: Record<string, string> = {}) {
  if (!CORE_HMAC_SECRET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CORE_HMAC_SECRET is required for production Core writes");
    }
    return { ...base };
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", CORE_HMAC_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return { ...base, "x-timestamp": timestamp, "x-signature": signature };
}
