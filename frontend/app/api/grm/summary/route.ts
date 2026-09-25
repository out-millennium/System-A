import { NextResponse } from "next/server";
import { getLedgerSummary } from "@/lib/grm";

export async function GET() {
  try {
    const data = await getLedgerSummary();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
