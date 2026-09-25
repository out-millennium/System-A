import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AnalyticsView from "@/components/AnalyticsView";

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!session.user.onboarded) redirect("/register");

  const account = session.user.accountName ?? "";

  return <AnalyticsView account={account} />;
}
