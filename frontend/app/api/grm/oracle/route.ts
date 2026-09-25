import { NextResponse } from "next/server";

const GRM_SERVICE_URL = process.env.GRM_SERVICE_URL!;

export async function GET() {
  try {
    const res = await fetch(`${GRM_SERVICE_URL}/grm/oracle/rates`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Oracle fetch failed");
    return NextResponse.json(await res.json());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
