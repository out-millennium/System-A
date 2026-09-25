import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SystemGrmView from "@/components/SystemGrmView";

/* System (automatic) GRM page. Read-only: it displays the systemic GRM computed
   by the GRM Service, plus infrastructure diagnostics. It is SEPARATE from the
   research calculator at /dashboard/grm. */
export default async function SystemGrmPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!session.user.onboarded) redirect("/register");

  const account = session.user.accountName ?? "";
  return <SystemGrmView account={account} />;
}
