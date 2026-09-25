import "server-only";

/* Offline IP → region lookup (geoip-lite bundles its own database, no network).
   Server-only. Returns a compact { country, region } or null. Loaded lazily so
   the ~large DB isn't pulled into unrelated bundles. */
type Geo = { country: string; region: string } | null;

export function lookupRegion(ip: string | null | undefined): Geo {
  if (!ip) return null;
  // Normalize common proxy formats (take first hop, strip port/zone).
  const clean = ip.split(",")[0].trim().replace(/^::ffff:/, "").split("%")[0];
  try {
    // Require at call time so the DB loads only when actually used.
    const geoip = require("geoip-lite") as {
      lookup: (ip: string) => { country?: string; region?: string } | null;
    };
    const r = geoip.lookup(clean);
    if (!r || !r.country) return null;
    return { country: r.country, region: r.region || "" };
  } catch {
    return null;
  }
}

/* Does an IP's resolved region match a free-text query? Matches on country code
   (e.g. "US") or region code, case-insensitive. */
export function regionMatches(ip: string | null | undefined, query: string): boolean {
  const g = lookupRegion(ip);
  if (!g) return false;
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    g.country.toLowerCase().includes(q) ||
    g.region.toLowerCase().includes(q) ||
    `${g.country}-${g.region}`.toLowerCase().includes(q)
  );
}
