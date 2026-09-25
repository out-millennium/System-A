"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { useT, useI18n } from "@/lib/i18n";
import { buildMessage } from "@/components/RestrictionDialog";
import AppealForm from "@/components/AppealForm";
import type { ModerationStatus } from "@/lib/moderation";

const EASE = [0.22, 1, 0.36, 1] as const;

/* Wraps login / register. A signed-in but RESTRICTED user (banned or muted)
   keeps their session (cookies are never cleared) and cannot switch into a
   different account, so we replace the whole auth form with a notice:
   • login    → "your session is banned/muted; you can't sign into another
                 account", plus a one-time appeal and a link to browse the site.
   • register → "you can't create accounts right now — go to sign in".
   A non-restricted, not-yet-onboarded user still sees the form; a fully
   onboarded, unrestricted user is offered a shortcut back into the dashboard. */
export default function AuthGate({
  children,
  mode = "login",
}: {
  children: React.ReactNode;
  mode?: "login" | "register";
}) {
  const t = useT();
  const { locale } = useI18n();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [mod, setMod] = useState<ModerationStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  const user = session?.user as
    | { accountName?: string | null; onboarded?: boolean }
    | undefined;

  // When onboarding finishes, the session flips to onboarded while the register
  // page is still mounted for an instant before navigation lands on the
  // dashboard. Rendering the "you can't create accounts" panel in that instant
  // makes a modal/notice FLASH and vanish. Instead, redirect and render nothing
  // during that transition. Only relevant once moderation status is loaded and
  // the user is unrestricted.
  const restrictedNow = mod?.banned.active || mod?.muted.active;
  const shouldRedirectOnboarded =
    status === "authenticated" &&
    loaded &&
    !restrictedNow &&
    mode === "register" &&
    Boolean(user?.onboarded);

  useEffect(() => {
    if (shouldRedirectOnboarded) router.replace("/dashboard");
  }, [shouldRedirectOnboarded, router]);

  useEffect(() => {
    if (status !== "authenticated") {
      setLoaded(true);
      return;
    }
    fetch("/api/auth/moderation")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ModerationStatus | null) => setMod(d))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [status]);

  if (status !== "authenticated" || !loaded) return <>{children}</>;

  const restricted = mod?.banned.active || mod?.muted.active;

  if (restricted) {
    const kind = mod?.banned.active ? "ban" : "mute";
    const { title, text } = buildMessage(
      kind,
      mod?.banned.active ? mod.banned : mod!.muted,
      t as unknown as (k: string) => string,
      locale
    );
    return (
      <div className="relative flex min-h-[100svh] items-center justify-center px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="w-full max-w-md"
        >
          <div className="sa-panel p-8">
            <h1 className="sa-heading text-xl text-[var(--sa-danger)]">
              {title}
            </h1>
            <p className="sa-lead mt-4 text-sm leading-relaxed">{text}</p>
            {/* You can't sign into a different account while restricted. */}
            <p className="mt-4 text-sm text-[var(--sa-text-tertiary)]">
              {mode === "register"
                ? t("moderation.cannotRegister")
                : t("moderation.cannotSwitch")}
            </p>

            {/* One-time appeal, same as the sign-in dialog. */}
            <AppealForm />

            <Link href="/" className="sa-btn sa-btn-ghost mt-4 w-full">
              {t("moderation.viewSite")}
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // Not-yet-onboarded, unrestricted → normal form.
  if (!user?.onboarded) return <>{children}</>;

  // Register page: an onboarded, unrestricted user cannot create another
  // account. We redirect to the dashboard (see effect above) and render nothing
  // here so the notice never flashes during the post-onboarding transition.
  if (mode === "register") {
    return null;
  }

  const name = user?.accountName || "";
  return (
    <div className="relative flex min-h-[100svh] items-center justify-center px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="w-full max-w-md text-center"
      >
        <Link href="/dashboard" className="sa-btn sa-btn-primary w-full">
          {t("moderation.signInAs").replace("{name}", name)}
        </Link>
      </motion.div>
    </div>
  );
}
