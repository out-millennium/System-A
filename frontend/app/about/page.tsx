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

export default function AboutPage() {
  const t = useT();
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
          {t("about.eyebrow")}
        </motion.p>
        <motion.h1
          variants={fadeUp}
          className="sa-heading sa-text-gradient text-[clamp(2rem,5vw,3.75rem)]"
        >
          {t("about.title")}
        </motion.h1>
        <motion.p variants={fadeUp} className="sa-lead mt-8 text-base">
          {t("about.lead")}
        </motion.p>

        <div className="mt-20 space-y-6">
          <Card variants={fadeUp} title={t("about.isTitle")}>
            <p>{t("about.is1")}</p>
            <p>{t("about.is2")}</p>
          </Card>

          <Card variants={fadeUp} title={t("about.isNotTitle")}>
            <ul className="space-y-2">
              {[
                t("about.isNot1"),
                t("about.isNot2"),
                t("about.isNot3"),
                t("about.isNot4"),
              ].map((text) => (
                <li key={text} className="flex gap-3">
                  <span className="text-[var(--sa-text-quaternary)]">—</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card variants={fadeUp} title={t("about.principlesTitle")}>
            <ul className="space-y-2">
              {[
                t("about.pr1"),
                t("about.pr2"),
                t("about.pr3"),
                t("about.pr4"),
              ].map((text) => (
                <li key={text} className="flex gap-3">
                  <span className="text-[var(--sa-text-quaternary)]">—</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <motion.div variants={fadeUp} className="mt-14 flex flex-wrap gap-3">
          <Link href="/documents" className="sa-btn sa-btn-ghost">
            {t("about.viewDeclarations")}
          </Link>
          <Link href="/architecture" className="sa-btn sa-btn-ghost">
            {t("about.architecture")}
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}

function Card({
  title,
  children,
  variants,
}: {
  title: string;
  children: React.ReactNode;
  variants: Variants;
}) {
  return (
    <motion.section variants={variants} className="sa-card p-8">
      <h2 className="sa-eyebrow mb-5 !text-[var(--sa-text-secondary)]">
        {title}
      </h2>
      <div className="sa-lead space-y-4 text-sm">{children}</div>
    </motion.section>
  );
}
