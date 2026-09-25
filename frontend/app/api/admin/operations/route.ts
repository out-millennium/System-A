import { NextRequest, NextResponse } from "next/server";
import { getCreator } from "@/lib/admin";

/* Creator-only: view the global ledger (all operations). Proxies Core's
   admin-protected /ledger. Query: ?offset=&limit= */
const CORE_API_URL = process.env.CORE_API_URL!;
const CORE_ADMIN_KEY = process.env.CORE_ADMIN_KEY!;

export async function GET(req: NextRequest) {
  const creator = await getCreator();
  if (!creator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0");
  const limit = Math.min(
    100,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "20"))
  );

  const res = await fetch(
    `${CORE_API_URL}/ledger?limit=${limit}&offset=${offset}`,
    { headers: { "x-admin-key": CORE_ADMIN_KEY }, cache: "no-store" }
  );
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return NextResponse.json({ error: d.detail || "failed" }, { status: 400 });
  }
  return NextResponse.json(await res.json());
}
