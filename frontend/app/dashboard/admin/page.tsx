import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AdminView from "@/components/AdminView";

/* Admin panel. Access is verified server-side against the DB (not the session
   alone) so the status cannot be forged on the client. */
export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const userId = session.user.id as string | undefined;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountName: true, role: true, adminLevel: true },
  });

  // Hard gate: must be an admin with a level.
  if (!user || user.role !== "admin" || !user.adminLevel) {
    redirect("/dashboard");
  }

  return (
    <AdminView
      account={user.accountName ?? ""}
      level={user.adminLevel}
    />
  );
}
