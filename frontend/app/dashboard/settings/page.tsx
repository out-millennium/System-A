import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SettingsView from "@/components/SettingsView";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!session.user.onboarded) redirect("/register");

  const account = session.user.accountName ?? "";

  return <SettingsView account={account} />;
}
