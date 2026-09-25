import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import MessagesView from "@/components/MessagesView";

export default async function MessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!session.user.onboarded) redirect("/register");

  const account = session.user.accountName ?? "";

  return <MessagesView account={account} />;
}
