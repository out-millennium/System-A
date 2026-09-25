import { redirect } from "next/navigation";
import { getBalance, getAccountLedger } from "@/lib/api";
import { getCurrentUserWithApiKey } from "@/lib/currentUser";
import DashboardOverview from "@/components/DashboardOverview";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const current = await getCurrentUserWithApiKey();
  if (!current) redirect("/login");
  if (!current.user.onboarded) redirect("/register");

  const account = current.user.accountName ?? "";
  const api_key = current.user.apiKey ?? "";
  const adminLevel = current.session.user.adminLevel ?? null;
  const initialMode =
    resolvedSearchParams.mode === "burn" ? "burn" : "transfer";

  let balance = null;
  let recentOps: Array<any> = [];
  try {
    balance = await getBalance(account);
    // Fetch a window and take the 5 MOST RECENT (Core returns oldest-first).
    const window = await getAccountLedger(account, api_key, 0, 100);
    recentOps = [...window]
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, 5);
  } catch {
    redirect("/login");
  }

  return (
    <DashboardOverview
      account={account}
      balance={balance?.balance?.toString() ?? null}
      recentOps={recentOps}
      initialMode={initialMode}
      adminLevel={adminLevel}
    />
  );
}
