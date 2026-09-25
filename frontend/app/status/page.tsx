"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import SystemAMark from "@/components/SystemAMark";

const EASE = [0.22, 1, 0.36, 1] as const;

type Status = {
  core: "ok" | "error";
  grm: "ok" | "error";
  frontend: "ok" | "error";
};

/* Public status page: live availability of the platform's services. */
export default function StatusPage() {
  const t = useT();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ core: "error", grm: "error", frontend: "ok" }));
  }, []);

  const services = [
    { key: "core" as const, label: t("statusPage.serviceCore") },
    { key: "grm" as const, label: t("statusPage.serviceGrm") },
    { key: "frontend" as const, label: t("statusPage.serviceFrontend") },
  ];

  const allOk =
    status && services.every((s) => status[s.key] === "ok");

  return (
    <main className="relative mx-auto min-h-[100svh] max-w-[800px] px-6 py-28 md:px-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        <Link
          href="/"
          className="sa-eyebrow inline-flex items-center gap-2 transition-colors hover:text-[var(--sa-text-secondary)]"
        >
          <SystemAMark className="h-5 w-5" />
          System A
        </Link>
        <h1 className="sa-heading sa-text-gradient mt-6 text-4xl">
          {t("statusPage.title")}
        </h1>
        <p className="sa-lead mt-3 text-sm">{t("statusPage.lead")}</p>

        {/* Overall banner */}
        <div
          className="sa-panel mt-10 flex items-center gap-3 p-6"
          role="status"
          aria-live="polite"
        >
          <span
            className={`sa-dot ${
              !status
                ? ""
                : allOk
                  ? "sa-dot-ok sa-dot-live"
                  : "sa-dot-err"
            }`}
          />
          <p className="text-sm text-[var(--sa-text)]">
            {!status
              ? t("statusPage.checking")
              : allOk
                ? t("statusPage.operational")
                : t("statusPage.degraded")}
          </p>
        </div>

        {/* Per-service list */}
        <div className="mt-4 overflow-hidden rounded-[var(--sa-r-md)] border border-[var(--sa-line)]">
          {services.map((svc, i) => {
            const ok = status ? status[svc.key] === "ok" : null;
            return (
              <div
                key={svc.key}
                className={`flex items-center justify-between bg-[var(--sa-surface-0)] px-5 py-4 ${
                  i > 0 ? "border-t border-[var(--sa-line)]" : ""
                }`}
              >
                <span className="text-sm text-[var(--sa-text)]">
                  {svc.label}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={`sa-dot ${
                      ok === null
                        ? ""
                        : ok
                          ? "sa-dot-ok sa-dot-live"
                          : "sa-dot-err"
                    }`}
                  />
                  <span
                    className={`text-xs ${
                      ok === null
                        ? "text-[var(--sa-text-quaternary)]"
                        : ok
                          ? "text-[var(--sa-ok)]"
                          : "text-[var(--sa-danger)]"
                    }`}
                  >
                    {ok === null
                      ? t("statusPage.checking")
                      : ok
                        ? t("statusPage.up")
                        : t("statusPage.down")}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-sm text-[var(--sa-text-tertiary)]">
          <Link
            href="/"
            className="text-[var(--sa-text-secondary)] underline-offset-4 transition-colors hover:text-[var(--sa-text)] hover:underline"
          >
            {t("statusPage.backHome")}
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
