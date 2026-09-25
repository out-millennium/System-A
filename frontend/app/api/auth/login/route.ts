import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Use /api/auth/signin" }, { status: 410 });
}
