"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { DashHeader } from "@/components/DashHeader";
import GrmChart, { type GrmHistoryPoint } from "@/components/GrmChart";
import { useT, useI18n } from "@/lib/i18n";

/* Read-only view of the AUTOMATIC systemic GRM + infrastructure diagnostics.
   All values come from the GRM Service; the Frontend computes nothing here. */

type RateMeta = { sources: number; spread: number; flagged: boolean };
type WeightMeta = {
  sources: number;
  source_names?: string[];
  spread?: number | null;
  flagged?: boolean;
  included?: boolean;
  in_grm?: boolean;
  grm_weight?: number | null;
  normalized_weight?: number | null;
  relative_to_usd?: number | null;
  asset_class?: string;
  methods?: string[];
};
type Current = {
  ts?: string;
  basket_id?: string;
  L?: number;
  I?: number;
  A?: number;
  weights?: Record<string, number>;
  meta?: Record<string, RateMeta>;
  weight_meta?: Record<string, WeightMeta>;
  weight_sources_total?: number;
  weight_sources_responded?: number;
  weight_reference_usd_value?: number | null;
  asset_classes?: Record<string, string>;
  detail?: { status?: string; reason?: string };
  error?: string;
};
type Diagnostics = {
  last_run?: string | null;
  next_run?: string | null;
  last_error?: string | null;
  last_source_statuses?: Array<{
    source: string;
    ok: boolean;
    latency_ms: number;
    currencies: number;
    error: string;
  }>;
  last_weight_source_statuses?: Array<{
    source: string;
    ok: boolean;
    latency_ms: number;
    assets: number;
    error: string;
  }>;
  recent_source_events?: Array<{
    ts: string;
    source: string;
    ok: number;
    latency_ms: number;
    error: string;
  }>;
  latest?: Current | null;
};

const EASE = [0.22, 1, 0.36, 1] as const;

export default function SystemGrmView({ account }: { account: string }) {
  const t = useT();
  const { locale } = useI18n();
  const [current, setCurrent] = useState<Current | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [history, setHistory] = useState<GrmHistoryPoint[]>([]);
  const [unreachable, setUnreachable] = useState(false);
  const [grmUnavailable, setGrmUnavailable] = useState(false);
  // Date search: look up the snapshot nearest a given date/time.
  const [searchTs, setSearchTs] = useState("");
  const [searchResult, setSearchResult] = useState<
    | { ts: string; I: number; A: number; L: number; formula_version?: number; baseline_id?: string }
    | null
  >(null);
  const [searchError, setSearchError] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);

  async function searchByDate() {
    if (!searchTs) return;
    setSearchBusy(true);
    setSearchError("");
    setSearchResult(null);
    try {
      // datetime-local gives "YYYY-MM-DDTHH:mm" (local); send as ISO.
      const iso = new Date(searchTs).toISOString();
      const res = await fetch(`/api/grm/at?ts=${encodeURIComponent(iso)}`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        setSearchError(t("grmSystem.searchNone"));
        return;
      }
      if (!res.ok) throw new Error("failed");
      setSearchResult(await res.json());
    } catch {
      setSearchError(t("grmSystem.searchError"));
    } finally {
      setSearchBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [c, d, h] = await Promise.all([
          fetch("/api/grm/current", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/grm/diagnostics", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/grm/history", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!active) return;
        const unavailable = c?.detail?.status === "GRM_UNAVAILABLE";
        setGrmUnavailable(unavailable);
        setUnreachable(Boolean(c?.error) && Boolean(d?.error));
        if (!c?.error && !unavailable) setCurrent(c);
        if (!d?.error) setDiag(d);
        if (h?.history) setHistory(h.history);
      } catch {
        if (active) setUnreachable(true);
      }
    };
    load();
    const id = setInterval(load, 30000); // light polling for the monitoring view
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const fmt = (n?: number, d = 6) =>
    typeof n === "number" ? n.toFixed(d) : "—";
  const dt = (s?: string | null) =>
    s ? new Date(s).toLocaleString(locale) : "—";
  // Show the full rate universe, including assets that have no accepted weight
  // yet. Those assets are transparent in the table but do not enter systemic GRM.
  const qualitySymbols = Array.from(
    new Set([
      ...Object.keys(current?.meta ?? {}),
      ...Object.keys(current?.weight_meta ?? {}),
    ])
  ).sort((a, b) => {
    const wa = current?.weight_meta?.[a];
    const wb = current?.weight_meta?.[b];
    const rank = (item?: WeightMeta) => item?.in_grm ? 0 : item?.included ? 1 : 2;
    const ra = rank(wa);
    const rb = rank(wb);
    if (ra !== rb) return ra - rb;
    const va = wa?.grm_weight ?? wa?.normalized_weight ?? -1;
    const vb = wb?.grm_weight ?? wb?.normalized_weight ?? -1;
    if (va !== vb) return vb - va;
    return a.localeCompare(b);
  });

  return (
    <div className="sa-dashboard-zoom relative min-h-screen">
      <DashHeader account={account} active="grm-system" />

      <main className="mx-auto max-w-[900px] px-6 pb-28 pt-32 md:px-10 md:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <p className="sa-eyebrow mb-6">{t("grmSystem.eyebrow")}</p>
          <h1 className="sa-heading sa-text-gradient text-4xl md:text-5xl">
            {t("grmSystem.title")}
          </h1>
          <p className="sa-lead mt-6 max-w-2xl text-sm">{t("grmSystem.lead")}</p>
          <Link href="/dashboard/grm" className="sa-navlink mt-3 inline-block text-xs">
            {t("grmSystem.researchLink")} →
          </Link>
        </motion.div>

        {unreachable && (
          <p className="mt-8 text-sm text-[var(--sa-danger)]">
            {t("grmSystem.unreachable")}
          </p>
        )}
        {grmUnavailable && (
          <p className="mt-8 text-sm text-[var(--sa-warn)]">
            {t("grmSystem.unavailable")}
          </p>
        )}

        {/* Current systemic value */}
        <section className="sa-card mt-8 p-6 md:p-7">
          <p className="sa-eyebrow mb-4">{t("grmSystem.current")}</p>
          {current && typeof current.I === "number" ? (
            <>
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--sa-r-md)] border border-[var(--sa-line)] bg-[var(--sa-line-faint)]">
                {([["I(t)", current.I], ["A(t)", current.A], ["L(t)", current.L]] as const).map(
                  ([k, v]) => (
                    <div key={k} className="bg-[var(--sa-surface-0)] p-5">
                      <p className="text-[0.6875rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
                        {k}
                      </p>
                      <p className="sa-mono mt-2 text-lg text-[var(--sa-text)]">{fmt(v)}</p>
                    </div>
                  )
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-xs text-[var(--sa-text-tertiary)]">
                <span>{t("grmSystem.basket")}: <span className="sa-mono">{current.basket_id}</span></span>
                <span>{t("grmSystem.updated")}: {dt(current.ts)}</span>
                <span>{t("grmSystem.nextUpdate")}: {dt(diag?.next_run)}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--sa-text-tertiary)]">{t("grmSystem.stale")}</p>
          )}
        </section>

        {history.length > 1 && <GrmChart history={history} />}

        {/* Date search: the systemic GRM at a chosen moment (nearest snapshot). */}
        <section className="sa-card mt-4 p-6 md:p-7">
          <p className="sa-eyebrow mb-1">{t("grmSystem.searchTitle")}</p>
          <p className="mb-4 text-xs text-[var(--sa-text-tertiary)]">
            {t("grmSystem.searchLead")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={searchTs}
              onChange={(e) => setSearchTs(e.target.value)}
              className="sa-input w-auto !py-2 text-xs"
              aria-label={t("grmSystem.searchTitle")}
            />
            <button
              type="button"
              onClick={searchByDate}
              disabled={!searchTs || searchBusy}
              className="sa-btn sa-btn-primary !py-2 text-xs disabled:opacity-50"
            >
              {searchBusy ? t("grmSystem.searchWorking") : t("grmSystem.searchButton")}
            </button>
          </div>
          {searchError && (
            <p className="mt-3 text-xs text-[var(--sa-danger)]">{searchError}</p>
          )}
          {searchResult && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="mt-4 rounded-[var(--sa-r-md)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-4"
            >
              <p className="mb-3 text-xs text-[var(--sa-text-tertiary)]">
                {t("grmSystem.searchNearest")}: {dt(searchResult.ts)}
              </p>
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-line-faint)]">
                {([["I(t)", searchResult.I], ["A(t)", searchResult.A], ["L(t)", searchResult.L]] as const).map(
                  ([k, v]) => (
                    <div key={k} className="bg-[var(--sa-surface-0)] p-4">
                      <p className="text-[0.65rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
                        {k}
                      </p>
                      <p className="sa-mono mt-1 text-lg text-[var(--sa-text)]">
                        {typeof v === "number" ? v.toFixed(6) : "—"}
                      </p>
                    </div>
                  )
                )}
              </div>
              <p className="sa-mono mt-3 text-[0.6875rem] text-[var(--sa-text-quaternary)]">
                formula v{searchResult.formula_version ?? "?"} · baseline{" "}
                {searchResult.baseline_id ?? "—"}
              </p>
            </motion.div>
          )}
        </section>

        {/* Diagnostics: rate and weight data sources */}
        <section className="sa-card mt-4 p-6 md:p-7">
          <p className="sa-eyebrow mb-4">{t("grmSystem.sources")}</p>
          <div className="overflow-hidden rounded-[var(--sa-r-sm)] border border-[var(--sa-line)]">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-2 text-[0.65rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
              <span>{t("grmSystem.source")}</span>
              <span>{t("grmSystem.status")}</span>
              <span>{t("grmSystem.latency")}</span>
            </div>
            {(diag?.last_source_statuses ?? []).map((s) => (
              <div key={s.source} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[var(--sa-line-faint)] px-4 py-2.5 text-xs last:border-b-0">
                <span className="sa-mono text-[var(--sa-text-secondary)]">{s.source}</span>
                <span className={s.ok ? "text-[var(--sa-ok)]" : "text-[var(--sa-danger)]"}>
                  {s.ok ? t("grmSystem.ok") : `${t("grmSystem.failed")}${s.error ? ` · ${s.error}` : ""}`}
                </span>
                <span className="sa-mono text-[var(--sa-text-tertiary)]">{s.latency_ms} ms</span>
              </div>
            ))}
            {(diag?.last_source_statuses ?? []).length === 0 && (
              <div className="px-4 py-3 text-xs text-[var(--sa-text-tertiary)]">—</div>
            )}
          </div>

          <p className="sa-eyebrow mb-3 mt-6">{t("grmSystem.weightSources")}</p>
          <div className="overflow-hidden rounded-[var(--sa-r-sm)] border border-[var(--sa-line)]">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-2 text-[0.65rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
              <span>{t("grmSystem.weightSource")}</span>
              <span>{t("grmSystem.status")}</span>
              <span>{t("grmSystem.weightAssets")}</span>
            </div>
            {(diag?.last_weight_source_statuses ?? []).map((s) => (
              <div key={s.source} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[var(--sa-line-faint)] px-4 py-2.5 text-xs last:border-b-0">
                <span className="sa-mono text-[var(--sa-text-secondary)]">{s.source}</span>
                <span className={s.ok ? "text-[var(--sa-ok)]" : "text-[var(--sa-danger)]"}>
                  {s.ok ? t("grmSystem.ok") : `${t("grmSystem.failed")}${s.error ? ` · ${s.error}` : ""}`}
                </span>
                <span className="sa-mono text-[var(--sa-text-tertiary)]">{s.assets || "—"}</span>
              </div>
            ))}
            {(diag?.last_weight_source_statuses ?? []).length === 0 && (
              <div className="px-4 py-3 text-xs text-[var(--sa-text-tertiary)]">—</div>
            )}
          </div>
        </section>

        {/* Diagnostics: data quality (rates + source-derived weights). */}
        {qualitySymbols.length > 0 && (
          <section className="sa-card mt-4 p-6 md:p-7">
            <p className="sa-eyebrow mb-1">{t("grmSystem.quality")}</p>
            <p className="mb-4 text-xs text-[var(--sa-text-tertiary)]">
              {t("grmSystem.weightPolicy")}
            </p>
            <div className="overflow-x-auto rounded-[var(--sa-r-sm)] border border-[var(--sa-line)]">
              {/* Fixed columns keep rate and weight diagnostics aligned. The
                  table intentionally scrolls horizontally on narrow screens. */}
              <div className="grid min-w-[720px] grid-cols-[minmax(10rem,1fr)_3.5rem_5rem_4rem_5rem_5rem_5.5rem] items-center gap-3 border-b border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-2 text-[0.6rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
                <span>{t("grmSystem.asset")}</span>
                <span className="text-right">{t("grmSystem.srcCount")}</span>
                <span className="text-right">{t("grmSystem.spread")}</span>
                <span className="text-right">{t("grmSystem.weightSourcesCount")}</span>
                <span className="text-right">{t("grmSystem.weightSpread")}</span>
                <span className="text-right">{t("grmSystem.relativeToUsd")}</span>
                <span className="text-right">{t("grmSystem.grmWeight")}</span>
              </div>
              {qualitySymbols.map((sym) => {
                const rate = current?.meta?.[sym];
                const weight = current?.weight_meta?.[sym];
                const inGrm = Boolean(weight?.in_grm && weight?.grm_weight != null);
                const disputed = Boolean(rate?.flagged || weight?.flagged);
                return (
                  <div
                    key={sym}
                    className="grid min-w-[720px] grid-cols-[minmax(10rem,1fr)_3.5rem_5rem_4rem_5rem_5rem_5.5rem] items-center gap-3 border-b border-[var(--sa-line-faint)] px-4 py-2.5 text-xs last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="sa-mono text-[var(--sa-text-secondary)]">{sym}</span>
                      {weight?.asset_class && weight.asset_class !== "currency" && (
                        <span className="text-[0.6rem] text-[var(--sa-text-quaternary)]">{weight.asset_class}</span>
                      )}
                      {disputed && (
                        <span
                          title={t("grmSystem.flaggedHint")}
                          className="rounded-full bg-[var(--sa-warn)]/15 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wide text-[var(--sa-warn)]"
                        >
                          {t("grmSystem.flagged")}
                        </span>
                      )}
                    </span>
                    <span className="text-right sa-mono tabular-nums text-[var(--sa-text-tertiary)]">
                      {rate?.sources ?? "—"}
                    </span>
                    <span className="text-right sa-mono tabular-nums text-[var(--sa-text-tertiary)]">
                      {typeof rate?.spread === "number" ? `${(rate.spread * 100).toFixed(2)}%` : "—"}
                    </span>
                    <span className="text-right sa-mono tabular-nums text-[var(--sa-text-tertiary)]">
                      {weight?.sources ?? "—"}
                    </span>
                    <span className="text-right sa-mono tabular-nums text-[var(--sa-text-tertiary)]">
                      {typeof weight?.spread === "number" ? `${(weight.spread * 100).toFixed(2)}%` : "—"}
                    </span>
                    <span className="text-right sa-mono tabular-nums text-[var(--sa-text-tertiary)]">
                      {typeof weight?.relative_to_usd === "number" ? weight.relative_to_usd.toExponential(2) : "—"}
                    </span>
                    <span
                      className={`text-right sa-mono tabular-nums ${inGrm ? "text-[var(--sa-text)]" : "text-[var(--sa-text-quaternary)]"}`}
                      title={inGrm ? (weight?.methods ?? []).join(", ") : t("grmSystem.weightUnavailable")}
                    >
                      {inGrm && typeof weight?.grm_weight === "number" ? weight.grm_weight.toFixed(6) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Legend so "—", "flagged" and the two weight meanings remain
                unambiguous to a reader of the monitoring page. */}
            <p className="mt-3 text-[0.6875rem] leading-relaxed text-[var(--sa-text-quaternary)]">
              {t("grmSystem.qualityLegend")}
            </p>
          </section>
        )}

        {/* Diagnostics: recent source events (error journal) */}
        <section className="sa-card mt-4 p-6 md:p-7">
          <p className="sa-eyebrow mb-4">{t("grmSystem.errorsTitle")}</p>
          {(diag?.recent_source_events ?? []).length === 0 ? (
            <p className="text-sm text-[var(--sa-text-tertiary)]">{t("grmSystem.noErrors")}</p>
          ) : (
            <div className="space-y-1">
              {(diag?.recent_source_events ?? []).slice(0, 20).map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-3 py-2 text-xs">
                  <span className="sa-mono text-[var(--sa-text-secondary)]">
                    {e.source}
                    <span className={e.ok ? "ml-2 text-[var(--sa-ok)]" : "ml-2 text-[var(--sa-danger)]"}>
                      {e.ok ? t("grmSystem.ok") : t("grmSystem.failed")}
                    </span>
                    {e.error ? <span className="ml-2 text-[var(--sa-text-quaternary)]">{e.error}</span> : null}
                  </span>
                  <span className="text-[var(--sa-text-quaternary)]">{dt(e.ts)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
