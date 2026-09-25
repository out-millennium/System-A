import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isRestricted } from "@/lib/moderation";
import { registerVisitorLanguageVisit } from "@/lib/visitorLanguage";
import LandingPage from "@/components/LandingPage";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) {
    const userId = session.user.id as string | undefined;
    // A banned or muted user keeps their session (cookies stay), but must be
    // able to "browse the site": show them the public landing instead of
    // bouncing them into the dashboard.
    if (userId && (await isRestricted(userId))) {
      const visitorFirstVisit = await registerVisitorLanguageVisit();
      return <LandingPage visitorFirstVisit={visitorFirstVisit} />;
    }
    redirect(session.user.onboarded ? "/dashboard" : "/register");
  }
  const visitorFirstVisit = await registerVisitorLanguageVisit();
  return <LandingPage visitorFirstVisit={visitorFirstVisit} />;
}
