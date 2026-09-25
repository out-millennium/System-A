import { NextRequest, NextResponse } from "next/server";

const GRM_SERVICE_URL = process.env.GRM_SERVICE_URL!;

/* Look up the systemic GRM snapshot nearest to a timestamp (date search).
   GET /api/grm/at?ts=<ISO-8601>. Proxies the GRM Service; the value is computed
   there and only read here. */
export async function GET(req: NextRequest) {
  const ts = req.nextUrl.searchParams.get("ts");
  if (!ts) {
    return NextResponse.json({ error: "ts_required" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${GRM_SERVICE_URL}/grm/at?ts=${encodeURIComponent(ts)}`,
      { cache: "no-store" }
    );
    if (res.status === 404) {
      return NextResponse.json({ error: "no_snapshot" }, { status: 404 });
    }
    if (!res.ok) throw new Error("Failed");
    return NextResponse.json(await res.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
