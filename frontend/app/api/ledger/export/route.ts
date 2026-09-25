import { NextRequest, NextResponse } from "next/server";
import { getAccountLedger } from "@/lib/api";

import { getCurrentUserWithApiKey } from "@/lib/currentUser";
/* Export the full ledger for the current account as CSV or JSON.
   Fetches every page from Core (100 at a time) and streams a downloadable
   file. Query: ?format=csv|json (default csv). */

type Operation = {
  operation_id: string;
  client_operation_id: string;
  operation_type: string;
  from_account: string | null;
  to_account: string | null;
  amount: string;
  timestamp: string;
};

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Quote if it contains comma, quote or newline; double internal quotes.
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const current = await getCurrentUserWithApiKey();
  const account = current?.user.accountName;
  const apiKey = current?.user.apiKey;
  if (!account || !apiKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const format = (req.nextUrl.searchParams.get("format") || "csv").toLowerCase();

  // Collect all pages.
  const all: Operation[] = [];
  const pageSize = 100;
  let offset = 0;
  try {
    // Hard cap to avoid an unbounded loop if Core keeps returning full pages.
    for (let i = 0; i < 1000; i++) {
      const page: Operation[] = await getAccountLedger(
        account,
        apiKey,
        offset,
        pageSize
      );
      all.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new NextResponse(JSON.stringify(all, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="ledger-${account}-${stamp}.json"`,
      },
    });
  }

  // CSV
  const columns = [
    "operation_id",
    "client_operation_id",
    "operation_type",
    "from_account",
    "to_account",
    "amount",
    "timestamp",
  ];
  const header = columns.join(",");
  const rows = all.map((op) =>
    columns.map((c) => csvEscape((op as any)[c])).join(",")
  );
  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledger-${account}-${stamp}.csv"`,
    },
  });
}
