import { NextResponse } from "next/server";
import { getBalance } from "@/lib/api";

import { getCurrentUserWithApiKey } from "@/lib/currentUser";
export async function GET() {
  const current = await getCurrentUserWithApiKey();
  const account = current?.user.accountName;
  const api_key = current?.user.apiKey;
  if (!account || !api_key) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getBalance(account));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
