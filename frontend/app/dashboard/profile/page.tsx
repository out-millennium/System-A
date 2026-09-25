import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProfileView from "@/components/ProfileView";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (!session.user.onboarded) redirect("/register");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      accountName: true,
      createdAt: true,
      role: true,
      adminLevel: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <ProfileView
      email={user.email ?? ""}
      accountName={user.accountName ?? ""}
      memberSince={new Date(user.createdAt).toLocaleDateString()}
      role={user.role}
      adminLevel={user.adminLevel}
    />
  );
}
