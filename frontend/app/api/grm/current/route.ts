import { NextResponse } from "next/server";

/* Proxy to the GRM Service's systemic value. The Frontend performs NO GRM
   computation — it only displays what the GRM Service already computed. */
const GRM_SERVICE_URL = process.env.GRM_SERVICE_URL!;

export async function GET() {
  try {
    const res = await fetch(`${GRM_SERVICE_URL}/grm/current`, { cache: "no-store" });
    const payload = await res.json().catch(() => ({ error: `GRM current failed (${res.status})` }));
    // Preserve the service's first-class GRM_UNAVAILABLE contract instead of
    // hiding it behind a generic proxy 502. Meridian and the UI must never
    // mistake an unavailable systemic value for a numeric quote.
    if (!res.ok) return NextResponse.json(payload, { status: res.status });
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
