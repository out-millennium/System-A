"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n";
import { motion } from "framer-motion";
import GrmChart, { type GrmHistoryPoint } from "@/components/GrmChart";

type GRMResult = {
  L: number;
  I: number;
  A: number;
  weights: Record<string, number>;
};
type HistoryPoint = GrmHistoryPoint;

/* One row of the research basket. Rates/codes can be edited manually; weights
   are read-only and come only from the accepted weight sources. */
type Row = { id: string; code: string; rate: string; weight: string };

const EASE = [0.22, 1, 0.36, 1] as const;

// Default basket (matches the hourly snapshot basket used by the GRM service).
const DEFAULT_ROWS: Row[] = [
  { id: "r1", code: "USD", rate: "1.0", weight: "" },
  { id: "r2", code: "EUR", rate: "0.92", weight: "" },
  { id: "r3", code: "GBP", rate: "0.78", weight: "" },
  { id: "r4", code: "JPY", rate: "150", weight: "" },
  { id: "r5", code: "CHF", rate: "0.88", weight: "" },
];

/* Basket currencies that the GRM computation uses. Only these are auto-added
   from the oracle (USD is the reference base = 1, so it is not auto-added). */
const BASKET_CURRENCIES = ["EUR", "GBP", "JPY", "CNY", "CHF"];

let rowSeq = 100;
const newRow = (): Row => ({
  id: `r${rowSeq++}`,
  code: "",
  rate: "",
  weight: "",
});

export default function GRMPage() {
  const t = useT();
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    else if (
      status === "authenticated" &&
      !session?.user?.onboarded
    ) {
      router.replace("/register");
    }
  }, [status, session, router]);

  const [rows, setRows] = useState<Row[]>(DEFAULT_ROWS);
  const [result, setResult] = useState<GRMResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    fetch("/api/grm/history")
      .then((r) => r.json())
      .then((d) => {
        if (d.history) setHistory(d.history);
      })
      .catch(() => {});
  }, []);

  // ---- row editing ------------------------------------------------------
  function updateRow(id: string, field: keyof Omit<Row, "id">, value: string) {
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? { ...r, [field]: field === "code" ? value.toUpperCase() : value }
          : r
      )
    );
  }
  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }
  function removeRow(id: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  }
  function resetBasket() {
    setResult(null);
    setError("");
    setNotice("");
    setRows(DEFAULT_ROWS.map((r) => ({ ...r })));
  }

  const weightSum = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0);

  // ---- oracle: fill rates for current rows + add any missing currencies --
  async function loadOracleRates() {
    setOracleLoading(true);
    setError("");
    try {
      const res = await fetch("/api/grm/oracle");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const oracleRates: Record<string, number> =
        data && data.rates && typeof data.rates === "object" ? data.rates : {};
      const oracleWeights: Record<string, number> =
        data && data.weights && typeof data.weights === "object" ? data.weights : {};

      // The oracle responded but returned no rates at all — treat as unreachable
      // (e.g. the GRM service has no outbound internet, or all sources failed).
      if (Object.keys(oracleRates).length === 0) {
        throw new Error(t("grm.errOracle"));
      }

      // Compute the next rows + counters SYNCHRONOUSLY (not inside the setState
      // updater), so the "nothing matched" check below is reliable.
      const present = new Set(rows.map((r) => r.code.trim().toUpperCase()));
      let filled = 0;
      let added = 0;

      // 1) Fill the Rate column of currencies already in the table.
      const updated: Row[] = rows.map((r) => {
        const code = r.code.trim().toUpperCase();
        if (code === "USD") {
          filled++;
          return {
            ...r,
            rate: "1", // rates are USD-relative
            weight: typeof oracleWeights[code] === "number" ? String(oracleWeights[code]) : r.weight,
          };
        }
        if (typeof oracleRates[code] === "number") {
          filled++;
          return {
            ...r,
            rate: String(oracleRates[code]),
            weight: typeof oracleWeights[code] === "number" ? String(oracleWeights[code]) : r.weight,
          };
        }
        return r;
      });

      // 2) Add ONLY the basket currencies (used in the computation) that are
      //    not yet in the table, as new rows (weight left blank to set).
      for (const code of BASKET_CURRENCIES) {
        if (!present.has(code) && typeof oracleRates[code] === "number") {
          updated.push({
            id: `r${rowSeq++}`,
            code,
            rate: String(oracleRates[code]),
            weight: typeof oracleWeights[code] === "number" ? String(oracleWeights[code]) : "",
          });
          added++;
        }
      }

      if (filled === 0 && added === 0) throw new Error(t("grm.errOracleEmpty"));

      setRows(updated);
      setNotice(
        Object.keys(oracleWeights).length > 0
          ? t("grm.oracleWeightsLoaded").replace("{n}", String(Object.keys(oracleWeights).length))
          : added > 0
            ? t("grm.oracleAdded").replace("{n}", String(added))
            : ""
      );
    } catch (e: any) {
      // Our own in-flow errors are thrown already-translated (via t(...)). A raw
      // browser/network exception (e.g. a locale-specific "failed to fetch")
      // must NOT leak to the UI untranslated — fall back to the localized message
      // unless the thrown message is one of our known translated strings.
      const known = [t("grm.errOracleEmpty"), t("grm.errOracle")];
      setError(known.includes(e?.message) ? e.message : t("grm.errOracle"));
    }
    setOracleLoading(false);
  }

  // ---- load the complete accepted source-weight basket -------------------
  async function loadSourceWeights() {
    setOracleLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/grm/oracle", { cache: "no-store" });
      const data = await res.json();
      const sourceWeights: Record<string, number> =
        data && data.weights && typeof data.weights === "object" ? data.weights : {};
      const sourceRates: Record<string, number> =
        data && data.rates && typeof data.rates === "object" ? data.rates : {};
      const entries = Object.entries(sourceWeights)
        .filter(([code, weight]) => Boolean(code) && Number.isFinite(weight) && weight > 0)
        .filter(([code]) => code === "USD" || typeof sourceRates[code] === "number")
        .sort((a, b) => b[1] - a[1]);
      if (entries.length === 0) throw new Error(t("grm.errOracleEmpty"));

      const present = new Set(rows.map((r) => r.code.trim().toUpperCase()));
      const updated = rows.map((r) => {
        const code = r.code.trim().toUpperCase();
        if (code in sourceWeights) {
          return {
            ...r,
            rate: code === "USD" ? "1" : typeof sourceRates[code] === "number" ? String(sourceRates[code]) : r.rate,
            weight: String(sourceWeights[code]),
          };
        }
        return { ...r, weight: "0" };
      });
      let added = 0;
      for (const [code, weight] of entries) {
        if (present.has(code)) continue;
        updated.push({
          id: `r${rowSeq++}`,
          code,
          rate: code === "USD" ? "1" : String(sourceRates[code]),
          weight: String(weight),
        });
        added++;
      }
      setRows(updated);
      setNotice(
        t("grm.sourceWeightsLoaded")
          .replace("{n}", String(entries.length))
          .replace("{added}", String(added))
      );
    } catch (e: any) {
      const known = [t("grm.errOracleEmpty"), t("grm.errOracle")];
      setError(known.includes(e?.message) ? e.message : t("grm.errOracle"));
    } finally {
      setOracleLoading(false);
    }
  }

  // ---- compute: build rates/weights from the table ----------------------
  async function handleCompute(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    const clean = rows
      .map((r) => ({
        code: r.code.trim().toUpperCase(),
        rate: parseFloat(r.rate),
        weight: parseFloat(r.weight),
      }))
      .filter((r) => r.code);

    if (clean.length === 0) {
      setError(t("grm.errNoRows"));
      return;
    }
    if (
      clean.some(
        (r) => !Number.isFinite(r.rate) || !Number.isFinite(r.weight)
      )
    ) {
      setError(t("grm.errBadRow"));
      return;
    }

    const parsedRates: Record<string, number> = {};
    const parsedWeights: Record<string, number> = {};
    for (const r of clean) {
      parsedRates[r.code] = r.rate;
      parsedWeights[r.code] = r.weight;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/grm/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates: parsedRates, weights: parsedWeights }),
      });
      const data = await res.json();
      // Server error strings are technical/English; show the localized message
      // rather than leaking a raw untranslated code to the user.
      if (!res.ok) setError(t("grm.errCompute"));
      else setResult(data);
    } catch {
      setError(t("grm.errCompute"));
    }
    setLoading(false);
  }

  return (
    <div className="sa-dashboard-zoom relative min-h-screen">
      {/* Compact header */}
      <header className="sa-nav">
        <div className="mx-auto flex max-w-[900px] items-center justify-between px-6 py-3.5 md:px-10">
          <Link href="/dashboard" className="sa-navlink flex items-center gap-2 text-sm">
            <span>←</span> {t("grm.back")}
          </Link>
          <span className="sa-badge">{t("grm.externalModel")}</span>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-6 pb-28 pt-32 md:px-10 md:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <p className="sa-eyebrow mb-6">{t("grm.eyebrow")}</p>
          <h1 className="sa-heading sa-text-gradient text-4xl md:text-5xl">
            {t("grm.title")}
          </h1>
          <p className="sa-lead mt-6 max-w-xl text-sm">
            {t("grm.disclaimer")}
          </p>
        </motion.div>

        {/* Access to the systemic GRM (moved off the top nav to here). */}
        <Link
          href="/dashboard/grm-system"
          className="sa-interactive sa-serif group mt-6 flex items-center justify-between rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-4 py-3 text-sm text-[var(--sa-text-secondary)]"
        >
          <span className="transition-colors group-hover:text-[var(--sa-text)]">
            {t("dashboard.navGrmSystem")}
          </span>
          <span className="text-[var(--sa-text-quaternary)] transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>

        {history.length > 1 && <GrmChart history={history} />}

        {/* Interactive currency-basket table */}
        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
          onSubmit={handleCompute}
          className="sa-card mt-4 space-y-5 p-6 md:p-7"
        >
          <div className="flex items-center justify-between">
            <p className="sa-eyebrow !mb-0">{t("grm.basket")}</p>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={loadOracleRates}
                disabled={oracleLoading}
                className="sa-navlink text-xs disabled:opacity-40"
              >
                {oracleLoading ? t("grm.loadingOracle") : t("grm.loadOracle")}
              </button>
              <button
                type="button"
                onClick={loadSourceWeights}
                disabled={oracleLoading}
                className="sa-navlink text-xs disabled:opacity-40"
              >
                {oracleLoading ? t("grm.loadingWeights") : t("grm.loadSourceWeights")}
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 px-1 text-[0.6875rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
            <span>{t("grm.currency")}</span>
            <span>{t("grm.rate")}</span>
            <span>{t("grm.weight")}</span>
            <span className="w-8" aria-hidden="true" />
          </div>

          {/* Rows */}
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-3"
              >
                <input
                  className="sa-input sa-mono !py-2 uppercase"
                  value={r.code}
                  onChange={(e) => updateRow(r.id, "code", e.target.value)}
                  placeholder={t("grm.currency")}
                  maxLength={8}
                  aria-label={t("grm.currency")}
                />
                <input
                  className="sa-input sa-mono !py-2"
                  type="number"
                  step="any"
                  min="0"
                  value={r.rate}
                  onChange={(e) => updateRow(r.id, "rate", e.target.value)}
                  placeholder={t("grm.rate")}
                  aria-label={t("grm.rate")}
                />
                <input
                  className="sa-input sa-mono !py-2"
                  type="number"
                  step="any"
                  min="0"
                  value={r.weight}
                  readOnly
                  aria-readonly="true"
                  placeholder={t("grm.loadSourceWeights")}
                  aria-label={t("grm.weight")}
                />
                <button
                  type="button"
                  onClick={() => removeRow(r.id)}
                  disabled={rows.length <= 1}
                  aria-label={t("grm.remove")}
                  title={t("grm.remove")}
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] text-[var(--sa-text-quaternary)] transition-colors hover:border-[var(--sa-danger)] hover:text-[var(--sa-danger)] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Actions + weight sum */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={addRow}
                className="sa-navlink text-xs"
              >
                {t("grm.addCurrency")}
              </button>
              <button
                type="button"
                onClick={resetBasket}
                className="sa-navlink text-xs text-[var(--sa-text-quaternary)]"
              >
                {t("grm.resetBasket")}
              </button>
            </div>
            <span
              className={`sa-mono text-xs ${
                Math.abs(weightSum - 1) < 1e-6
                  ? "text-[var(--sa-ok)]"
                  : "text-[var(--sa-text-tertiary)]"
              }`}
            >
              {t("grm.weightSum")}: {weightSum.toFixed(4)}
            </span>
          </div>

          {notice && <p className="text-sm text-[var(--sa-ok)]">{notice}</p>}
          {error && <p className="text-sm text-[var(--sa-danger)]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="sa-btn sa-btn-primary w-full"
          >
            {loading ? t("grm.computing") : t("grm.compute")}
          </button>
        </motion.form>

        {result && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="sa-card mt-4 space-y-6 p-6 md:p-7"
          >
            <p className="sa-eyebrow">{t("grm.result")}</p>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--sa-r-md)] border border-[var(--sa-line)] bg-[var(--sa-line-faint)]">
              {(
                [
                  ["L(t)", result.L],
                  ["I(t)", result.I],
                  ["A(t)", result.A],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="bg-[var(--sa-surface-0)] p-5">
                  <p className="text-[0.6875rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
                    {k}
                  </p>
                  <p className="sa-mono mt-2 text-lg text-[var(--sa-text)]">
                    {v.toFixed(6)}
                  </p>
                </div>
              ))}
            </div>
            <div>
              <p className="sa-label">{t("grm.normalizedWeights")}</p>
              <div className="space-y-1">
                {Object.entries(result.weights).map(([k, v]) => (
                  <div
                    key={k}
                    className="sa-mono flex justify-between border-b border-[var(--sa-line-faint)] py-2 text-xs last:border-b-0"
                  >
                    <span className="text-[var(--sa-text-tertiary)]">{k}</span>
                    <span className="text-[var(--sa-text)]">
                      {(v as number).toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        )}
      </main>
    </div>
  );
}
