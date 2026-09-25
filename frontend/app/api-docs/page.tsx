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
  show: { transition: { staggerChildren: 0.06 } },
};

function Endpoint({
  method,
  path,
  children,
}: {
  method: string;
  path: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sa-surface !bg-[var(--sa-surface-0)] p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="sa-badge !text-[var(--sa-text)]">{method}</span>
        <span className="sa-mono text-xs text-[var(--sa-text-secondary)]">
          {path}
        </span>
      </div>
      <div className="space-y-3 text-xs text-[var(--sa-text-tertiary)]">
        {children}
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="sa-mono overflow-x-auto rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-base)] p-4 text-xs leading-relaxed text-[var(--sa-text-secondary)]">
      {children}
    </pre>
  );
}

export default function ApiDocsPage() {
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
          {t("apiDocs.eyebrow")}
        </motion.p>
        <motion.h1
          variants={fadeUp}
          className="sa-heading sa-text-gradient text-[clamp(2rem,5vw,3.75rem)]"
        >
          {t("apiDocs.title")}
        </motion.h1>
        <motion.p variants={fadeUp} className="sa-lead mt-8 text-base">
          {t("apiDocs.lead")}
        </motion.p>

        <motion.section variants={fadeUp} className="sa-card mt-16 space-y-6 p-8">
          <div>
            <h2 className="sa-eyebrow mb-4 !text-[var(--sa-text-secondary)]">
              {t("apiDocs.coreApiTitle")}
            </h2>
            <p className="sa-lead text-sm">{t("apiDocs.coreApiDesc")}</p>
          </div>

          <Endpoint method="POST" path="/transfer">
            <Code>{`{
  "from_account": "alice",
  "to_account": "bob",
  "amount": 100
}`}</Code>
            <p>{t("apiDocs.response")}</p>
            <Code>{`{
  "status": "ok"
}`}</Code>
          </Endpoint>

          <Endpoint
            method="GET"
            path="/ledger/{account_id}?limit=10&offset=0"
          >
            <p>{t("apiDocs.responseExample")}</p>
            <Code>{`[
  {
    "operation_id": "op_...",
    "operation_type": "transfer",
    "from_account": "alice",
    "to_account": "bob",
    "amount": "100",
    "timestamp": "2026-01-01T00:00:00Z"
  }
]`}</Code>
          </Endpoint>
        </motion.section>

        <motion.section variants={fadeUp} className="sa-card mt-8 space-y-6 p-8">
          <div>
            <h2 className="sa-eyebrow mb-4 !text-[var(--sa-text-secondary)]">
              {t("apiDocs.grmApiTitle")}
            </h2>
            <p className="sa-lead text-sm">{t("apiDocs.grmApiDesc")}</p>
          </div>

          <Endpoint method="POST" path="/grm/compute">
            <Code>{`{
  "rates": {"USD": 1.0, "EUR": 0.92, "GBP": 0.78},
  "weights": {"USD": 0.5, "EUR": 0.3, "GBP": 0.2}
}`}</Code>
            <p>{t("apiDocs.responseExample")}</p>
            <Code>{`{
  "L": 0.123,
  "I": 1.131,
  "A": 0.885,
  "weights": {"USD": 0.5, "EUR": 0.3, "GBP": 0.2}
}`}</Code>
          </Endpoint>
        </motion.section>

        <motion.section variants={fadeUp} className="sa-card mt-8 space-y-3 p-8">
          <h2 className="sa-eyebrow mb-3 !text-[var(--sa-text-secondary)]">
            {t("apiDocs.inspectTitle")}
          </h2>
          <ul className="sa-lead space-y-2 text-sm">
            {[
              t("apiDocs.inspect1"),
              t("apiDocs.inspect2"),
              t("apiDocs.inspect3"),
            ].map((text) => (
              <li key={text} className="flex gap-3">
                <span className="text-[var(--sa-text-quaternary)]">—</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </motion.section>

        <motion.div variants={fadeUp} className="mt-14">
          <Link href="/transparency" className="sa-btn sa-btn-ghost">
            {t("apiDocs.transparencyModel")}
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
