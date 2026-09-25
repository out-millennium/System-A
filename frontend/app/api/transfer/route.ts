import { NextRequest, NextResponse } from "next/server";
import { transfer } from "@/lib/api";
import { isRestricted } from "@/lib/moderation";

import { getCurrentUserWithApiKey } from "@/lib/currentUser";
export async function POST(req: NextRequest) {
  const current = await getCurrentUserWithApiKey();
  const account = current?.user.accountName;
  const api_key = current?.user.apiKey;
  const userId = current?.user.id;
  if (!account || !api_key) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (userId && (await isRestricted(userId)))
    return NextResponse.json({ error: "restricted" }, { status: 403 });
  const { to_account, amount } = await req.json();
  try {
    return NextResponse.json(await transfer(account, to_account, amount, api_key));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
