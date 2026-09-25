"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { useT } from "@/lib/i18n";

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

export default function TransparencyPage() {
  const t = useT();

  const links = [
    {
      label: t("transparency.coreRepo"),
      href: "https://github.com/out-millennium/system-a-core",
    },
    {
      label: t("transparency.grmModule"),
      href: "https://github.com/out-millennium/system-a-core",
    },
    {
      label: t("transparency.declarations"),
      href: "https://github.com/out-millennium/system-a-core/tree/main/docs",
    },
    { label: t("transparency.apiDocumentation"), href: "/api-docs" },
    { label: t("statusPage.title"), href: "/status" },
  ];

  return (
    <div className="relative min-h-screen px-6 py-32 md:px-10">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-3xl"
      >
        <motion.div variants={fadeUp}>
          <Link href="/" className="sa-navlink text-xs">
            ← {t("nav.home")}
          </Link>
        </motion.div>

        <motion.p variants={fadeUp} className="sa-eyebrow mt-10 mb-6">
          {t("transparency.eyebrow")}
        </motion.p>
        <motion.h1
          variants={fadeUp}
          className="sa-heading sa-text-gradient text-[clamp(2rem,5vw,3.75rem)]"
        >
          {t("transparency.title")}
        </motion.h1>
        <motion.p variants={fadeUp} className="sa-lead mt-8 text-base">
          {t("transparency.lead")}
        </motion.p>

        <motion.section variants={fadeUp} className="sa-card mt-16 p-8">
          <h2 className="sa-eyebrow mb-6 !text-[var(--sa-text-secondary)]">
            {t("transparency.resourcesTitle")}
          </h2>
          <div className="grid gap-px overflow-hidden rounded-[var(--sa-r-md)] border border-[var(--sa-line)] bg-[var(--sa-line-faint)]">
            {links.map((link) => {
              const external = !link.href.startsWith("/");
              return (
                <a
                  key={link.label}
                  href={link.href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className="sa-interactive group flex items-center justify-between bg-[var(--sa-surface-1)] px-5 py-4 text-sm text-[var(--sa-text-secondary)]"
                >
                  <span className="transition-colors group-hover:text-[var(--sa-text)]">
                    {link.label}
                  </span>
                  <span className="text-[var(--sa-text-quaternary)] transition-transform group-hover:translate-x-1">
                    {external ? "↗" : "→"}
                  </span>
                </a>
              );
            })}
          </div>
        </motion.section>

        <motion.section variants={fadeUp} className="sa-card mt-8 space-y-4 p-8">
          <h2 className="sa-eyebrow mb-2 !text-[var(--sa-text-secondary)]">
            {t("transparency.inspectionTitle")}
          </h2>
          <p className="sa-lead text-sm">{t("transparency.insp1")}</p>
          <p className="sa-lead text-sm">{t("transparency.insp2")}</p>
        </motion.section>
      </motion.div>
    </div>
  );
}
