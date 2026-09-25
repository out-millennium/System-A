import { NextRequest, NextResponse } from "next/server";
import { computeGRM } from "@/lib/grm";

export async function POST(req: NextRequest) {
  const { rates, weights } = await req.json();
  try {
    const data = await computeGRM(rates, weights);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
