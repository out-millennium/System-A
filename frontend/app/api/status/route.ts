import { NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL!;
const GRM_SERVICE_URL = process.env.GRM_SERVICE_URL!;

async function ping(url: string): Promise<"ok" | "error"> {
  try {
    const res = await fetch(`${url}/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function GET() {
  const [core, grm] = await Promise.all([
    ping(CORE_API_URL),
    ping(GRM_SERVICE_URL),
  ]);
  return NextResponse.json({ core, grm, frontend: "ok" });
}
