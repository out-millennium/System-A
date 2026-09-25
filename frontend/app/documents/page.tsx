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
  show: { transition: { staggerChildren: 0.05 } },
};

const documents = [
  { key: "d01", file: "01_non_asset_declaration.md" },
  { key: "d02", file: "02_system_a_specification.md" },
  { key: "d03", file: "03_creator_status_and_limitations.md" },
  { key: "d04", file: "04_external_app_recognition_policy.md" },
  { key: "d05", file: "05_external_application_policy.md" },
  { key: "d06", file: "06_procedural_neutrality_and_disclaimer.md" },
  { key: "d07", file: "07_user_status_no_rights.md" },
  { key: "d08", file: "08_records_and_history_status.md" },
  { key: "d09", file: "09_no_liability_for_hostile_interpretations.md" },
  { key: "d10", file: "10_no_economic_or_regulatory_function.md" },
] as const;

export default function DocumentsPage() {
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
          {t("documents.eyebrow")}
        </motion.p>
        <motion.h1
          variants={fadeUp}
          className="sa-heading sa-text-gradient text-[clamp(2rem,5vw,3.75rem)]"
        >
          {t("documents.title")}
        </motion.h1>
        <motion.p variants={fadeUp} className="sa-lead mt-8 text-base">
          {t("documents.lead")}
        </motion.p>

        <motion.div
          variants={stagger}
          className="mt-16 grid gap-px overflow-hidden rounded-[var(--sa-r-lg)] border border-[var(--sa-line)] bg-[var(--sa-line-faint)]"
        >
          {documents.map((doc, i) => (
            <motion.a
              key={doc.file}
              variants={fadeUp}
              href={`https://github.com/out-millennium/system-a-core/blob/main/docs/${doc.file}`}
              target="_blank"
              rel="noopener noreferrer"
              className="sa-interactive group flex items-center gap-5 bg-[var(--sa-surface-1)] px-6 py-5"
            >
              {/* pointer-events-none children => the whole row is one hit
                  target (single tap spot, no double hover ticks). */}
              <span className="pointer-events-none sa-mono text-xs text-[var(--sa-text-quaternary)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="pointer-events-none flex-1 text-sm text-[var(--sa-text-secondary)] transition-colors group-hover:text-[var(--sa-text)]">
                {t(`declarationTitles.${doc.key}`)}
              </span>
              <span className="pointer-events-none text-[var(--sa-text-quaternary)] transition-transform group-hover:translate-x-1">
                ↗
              </span>
            </motion.a>
          ))}
        </motion.div>

        <motion.div variants={fadeUp} className="mt-14 flex flex-wrap gap-3">
          <Link href="/transparency" className="sa-btn sa-btn-ghost">
            {t("documents.transparency")}
          </Link>
          <Link href="/about" className="sa-btn sa-btn-ghost">
            {t("documents.about")}
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
