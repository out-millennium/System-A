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
  show: { transition: { staggerChildren: 0.08 } },
};

export default function ArchitecturePage() {
  const t = useT();

  const sections = [
    { title: "Core", tag: "L1", description: t("architecture.coreDesc") },
    { title: t("architecture.grmName"), tag: "L2", description: t("architecture.grmDesc") },
    { title: "Frontend", tag: "L3", description: t("architecture.frontendDesc") },
    { title: "Infrastructure", tag: "L4", description: t("architecture.infraDesc") },
  ];

  return (
    <div className="relative min-h-screen px-6 py-32 md:px-10">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-4xl"
      >
        <motion.div variants={fadeUp}>
          <Link href="/" className="sa-navlink text-xs">
            ← {t("nav.home")}
          </Link>
        </motion.div>

        <motion.p variants={fadeUp} className="sa-eyebrow mt-10 mb-6">
          {t("architecture.eyebrow")}
        </motion.p>
        <motion.h1
          variants={fadeUp}
          className="sa-heading sa-text-gradient text-[clamp(2rem,5vw,3.75rem)]"
        >
          {t("architecture.title")}
        </motion.h1>
        <motion.p variants={fadeUp} className="sa-lead mt-8 max-w-2xl text-base">
          {t("architecture.lead")}
        </motion.p>

        <motion.div
          variants={stagger}
          className="mt-16 grid gap-px overflow-hidden rounded-[var(--sa-r-lg)] border border-[var(--sa-line)] bg-[var(--sa-line-faint)] md:grid-cols-2"
        >
          {sections.map((item) => (
            <motion.div
              key={item.tag}
              variants={fadeUp}
              className="sa-interactive bg-[var(--sa-surface-1)] p-8 md:p-10"
            >
              <div className="flex items-start justify-between">
                <h2 className="sa-heading text-2xl">{item.title}</h2>
                <span className="sa-mono text-xs text-[var(--sa-text-quaternary)]">
                  {item.tag}
                </span>
              </div>
              <p className="sa-lead mt-4 text-sm">{item.description}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.section
          variants={fadeUp}
          className="sa-card mt-8 space-y-4 p-8"
        >
          <h2 className="sa-eyebrow mb-2 !text-[var(--sa-text-secondary)]">
            {t("architecture.relationshipsTitle")}
          </h2>
          <p className="sa-lead text-sm">{t("architecture.rel1")}</p>
          <p className="sa-lead text-sm">{t("architecture.rel2")}</p>
        </motion.section>

        <motion.div variants={fadeUp} className="mt-14 flex flex-wrap gap-3">
          <Link href="/transparency" className="sa-btn sa-btn-ghost">
            {t("architecture.transparency")}
          </Link>
          <Link href="/api-docs" className="sa-btn sa-btn-ghost">
            {t("architecture.apiReference")}
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
