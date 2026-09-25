import { NextRequest, NextResponse } from "next/server";
import { getAccountLedger } from "@/lib/api";

import { getCurrentUserWithApiKey } from "@/lib/currentUser";
export async function GET(req: NextRequest) {
  const current = await getCurrentUserWithApiKey();
  const account = current?.user.accountName;
  const api_key = current?.user.apiKey;
  if (!account || !api_key) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0");
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "10")));
  try {
    return NextResponse.json(await getAccountLedger(account, api_key, offset, limit));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
