import { NextResponse } from "next/server";

/* Proxy to the GRM Service diagnostics (read-only display / monitoring). */
const GRM_SERVICE_URL = process.env.GRM_SERVICE_URL!;

export async function GET() {
  try {
    const res = await fetch(`${GRM_SERVICE_URL}/grm/diagnostics`, { cache: "no-store" });
    if (!res.ok) throw new Error(`GRM diagnostics failed (${res.status})`);
    return NextResponse.json(await res.json());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
