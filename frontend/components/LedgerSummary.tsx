"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

type Summary = {
  total_init_credited: number;
  total_burned: number;
  total_transfer_volume: number;
  total_transfer_count: number;
  circulating: number;
  operations_count: number;
};

export default function LedgerSummary() {
  const t = useT();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/grm/summary")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(true);
        else setData(d);
      })
      .catch(() => setError(true));
  }, []);

  if (error) return null;

  const items = [
    { label: t("summary.circulating"), value: data?.circulating },
    { label: t("summary.totalBurned"), value: data?.total_burned },
    { label: t("summary.transferVolume"), value: data?.total_transfer_volume },
    { label: t("summary.transfers"), value: data?.total_transfer_count },
  ];

  return (
    <section className="sa-card p-6 md:p-7">
      <div className="mb-5 flex items-center justify-between">
        <p className="sa-eyebrow">{t("summary.title")}</p>
        {!data && !error && (
          <span className="text-xs text-[var(--sa-text-quaternary)]">
            {t("summary.loading")}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--sa-r-md)] border border-[var(--sa-line)] bg-[var(--sa-line-faint)] sm:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="bg-[var(--sa-surface-0)] p-4">
            <p className="text-[0.6875rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
              {it.label}
            </p>
            <p className="sa-mono mt-2 text-lg text-[var(--sa-text)]">
              {data ? (it.value ?? 0).toLocaleString() : "—"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
