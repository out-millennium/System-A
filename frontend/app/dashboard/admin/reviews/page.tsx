import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ReviewsView from "@/components/ReviewsView";

/* Dedicated admin "Reviews" page: all review queues (admin applications,
   ban/mute appeals, deletion & key-revocation requests) in one place, gated to
   the levels that may act on them. Access verified server-side against the DB. */
export default async function ReviewsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { accountName: true, role: true, adminLevel: true },
  });
  if (!user || user.role !== "admin" || !user.adminLevel) {
    redirect("/dashboard");
  }

  return <ReviewsView account={user.accountName ?? ""} level={user.adminLevel} />;
}
