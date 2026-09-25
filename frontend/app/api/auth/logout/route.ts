import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const REMEMBER_COOKIE = "remembered_accounts";
const MAX_REMEMBERED = 5;

/* Sign out. Besides clearing the active-account cookies, we REMEMBER the account
   name(s) used on this device so the login page can offer quick chips. This is a
   convenience only — it stores just the display name + logout time, NEVER a
   credential. Signing in from a chip still requires a password or api key. */
export async function POST() {
  const cookieStore = await cookies();

  // Capture the account being logged out (from the session), if any.
  let name: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    name = (session?.user?.accountName as string) || null;
  } catch {
    /* no session */
  }

  cookieStore.delete("account");
  cookieStore.delete("api_key");

  if (name) {
    // Read existing list, prepend this account, de-dupe, cap length.
    let list: { name: string; at: number }[] = [];
    try {
      const raw = cookieStore.get(REMEMBER_COOKIE)?.value;
      if (raw) list = JSON.parse(raw);
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }
    list = [
      { name, at: Date.now() },
      ...list.filter((x) => x && x.name !== name),
    ].slice(0, MAX_REMEMBERED);
    cookieStore.set(REMEMBER_COOKIE, JSON.stringify(list), {
      httpOnly: false, // read by the login page to render chips (no secrets)
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }

  return NextResponse.json({ ok: true });
}
