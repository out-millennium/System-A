import { prisma } from "@/lib/prisma";

/* Reserved admin-name handling.
   Admin accounts use the names "admin####" (4 digits) or "system_admin".
   Regular users must not be able to impersonate an admin, so the substring
   "admin" is forbidden in their account name in ANY form — including capitals
   and common leet substitutions (a→@/4, i→1/!, o→0, s→5/$, e→3, etc.). */

// Map look-alike characters back to plain letters, then lowercase.
const LEET: Record<string, string> = {
  "@": "a",
  "4": "a",
  "8": "b",
  "(": "c",
  "3": "e",
  "€": "e",
  "6": "g",
  "1": "i",
  "!": "i",
  "|": "i",
  "0": "o",
  "5": "s",
  $: "s",
  "7": "t",
  "+": "t",
  "2": "z",
};

/** Normalize a name for comparison: strip separators, de-leet, lowercase. */
export function normalizeName(input: string): string {
  const lowered = (input || "").toLowerCase();
  let out = "";
  for (const ch of lowered) {
    if (/[a-z0-9]/.test(ch) === false && !(ch in LEET)) continue; // drop . _ - etc
    out += LEET[ch] ?? ch;
  }
  return out;
}

/** True if a user-chosen name illegitimately contains "admin". */
export function containsReservedAdmin(input: string): boolean {
  return normalizeName(input).includes("admin");
}

/** Generate a unique "admin####" name (4 random digits). */
export async function generateAdminName(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const digits = Math.floor(1000 + Math.random() * 9000); // 1000..9999
    const name = `admin${digits}`;
    const exists = await prisma.user.findUnique({
      where: { accountName: name },
    });
    if (!exists) return name;
  }
  // Extremely unlikely fallback.
  return `admin${Date.now().toString().slice(-4)}`;
}
