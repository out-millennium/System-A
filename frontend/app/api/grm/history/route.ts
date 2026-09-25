import { NextResponse } from "next/server";

const GRM_SERVICE_URL = process.env.GRM_SERVICE_URL!;

export async function GET() {
  try {
    const res = await fetch(`${GRM_SERVICE_URL}/grm/history`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed");
    return NextResponse.json(await res.json());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
