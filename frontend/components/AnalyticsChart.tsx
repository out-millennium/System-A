"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useT } from "@/lib/i18n";

type Op = {
  operation_id: string;
  operation_type: string;
  from_account: string | null;
  to_account: string | null;
  amount: string;
  timestamp: string;
};

type BalancePoint = { t: number; v: number }; // t = ms, v = running balance
type Timeframe = "day" | "week" | "month" | "all";

// Bucket size in seconds for candle aggregation.
const BUCKET_S: Record<Exclude<Timeframe, "all">, number> = {
  day: 24 * 60 * 60,
  week: 7 * 24 * 60 * 60,
  month: 30 * 24 * 60 * 60,
};

/* Technical balance chart built on TradingView Lightweight Charts.
   • Reconstructs the running balance from the ledger.
   • "Day / Week / Month" render OHLC candlesticks aggregated per bucket.
   • "All" renders a continuous line of every balance point.
   Built-in zoom (wheel), pan (drag) and time scaling come from the library. */
export default function AnalyticsChart({ account }: { account: string }) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(
    null
  );

  const [points, setPoints] = useState<BalancePoint[] | null>(null);
  const [tf, setTf] = useState<Timeframe>("week");

  // ---- Load ledger + reconstruct running balance -------------------------
  const load = useCallback(async () => {
    const res = await fetch("/api/ledger/export?format=json");
    if (!res.ok) {
      setPoints([]);
      return;
    }
    const ops: Op[] = await res.json();
    if (!Array.isArray(ops) || ops.length === 0) {
      setPoints([]);
      return;
    }
    const ordered = [...ops].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const delta = (op: Op): number => {
      const amt = Number(op.amount) || 0;
      if (op.operation_type === "burn")
        return op.from_account === account ? -amt : 0;
      let d = 0;
      if (op.to_account === account) d += amt;
      if (op.from_account === account) d -= amt;
      return d;
    };
    let running = 0;
    const pts: BalancePoint[] = ordered.map((op) => {
      running += delta(op);
      return { t: new Date(op.timestamp).getTime(), v: running };
    });
    setPoints(pts);
  }, [account]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Create the chart once ---------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const styles = getComputedStyle(document.documentElement);
    const text =
      styles.getPropertyValue("--sa-text-tertiary").trim() || "#9aa4ad";
    const line = styles.getPropertyValue("--sa-line").trim() || "#2a2e31";

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        fontFamily: "var(--font-mono-geist), monospace",
      },
      grid: {
        vertLines: { color: line },
        horzLines: { color: line },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line, timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // ---- (Re)build the series when data or timeframe changes ----------------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !points) return;

    // Remove the previous series.
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    if (points.length === 0) return;

    if (tf === "all") {
      // Continuous line of every balance point.
      const series = chart.addSeries(LineSeries, {
        color: "#cdd6e0",
        lineWidth: 2,
      });
      const data = dedupeByTime(
        points.map((p) => ({
          time: Math.floor(p.t / 1000) as UTCTimestamp,
          value: p.v,
        }))
      );
      series.setData(data);
      seriesRef.current = series;
    } else {
      // Aggregate balance into OHLC candles per bucket.
      const bucket = BUCKET_S[tf];
      const byBucket = new Map<number, number[]>();
      for (const p of points) {
        const b = Math.floor(p.t / 1000 / bucket) * bucket;
        if (!byBucket.has(b)) byBucket.set(b, []);
        byBucket.get(b)!.push(p.v);
      }
      const candles = Array.from(byBucket.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([time, vals]) => ({
          time: time as UTCTimestamp,
          open: vals[0],
          high: Math.max(...vals),
          low: Math.min(...vals),
          close: vals[vals.length - 1],
        }));

      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#4ea88a",
        downColor: "#c76a6a",
        borderUpColor: "#4ea88a",
        borderDownColor: "#c76a6a",
        wickUpColor: "#4ea88a",
        wickDownColor: "#c76a6a",
      });
      series.setData(candles);
      seriesRef.current = series;
    }

    chart.timeScale().fitContent();
  }, [points, tf]);

  const timeframes: Timeframe[] = ["day", "week", "month", "all"];
  const tfLabel = (f: Timeframe) =>
    t(
      `analytics.tf${f[0].toUpperCase()}${f.slice(1)}` as
        | "analytics.tfDay"
        | "analytics.tfWeek"
        | "analytics.tfMonth"
        | "analytics.tfAll"
    );

  const empty = points !== null && points.length === 0;

  return (
    <section className="sa-card p-6 md:p-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="sa-eyebrow">{t("analytics.chartTitle")}</p>
        <div className="flex flex-wrap gap-1">
          {timeframes.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setTf(f)}
              className={`sa-btn !rounded-[var(--sa-r-sm)] !px-3 !py-1.5 text-xs ${
                tf === f ? "sa-btn-primary" : "sa-btn-ghost"
              }`}
            >
              {tfLabel(f)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().fitContent()}
            className="sa-btn sa-btn-ghost !rounded-[var(--sa-r-sm)] !px-3 !py-1.5 text-xs"
          >
            {t("analytics.reset")}
          </button>
        </div>
      </div>

      {/* The chart container stays mounted so the library can attach to it;
          loading / empty messages overlay it. */}
      <div className="relative">
        <div
          ref={containerRef}
          className="h-[360px] w-full"
          style={{ visibility: empty ? "hidden" : "visible" }}
        />
        {points === null && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[var(--sa-text-tertiary)]">
            {t("analytics.loading")}
          </p>
        )}
        {empty && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[var(--sa-text-tertiary)]">
            {t("analytics.empty")}
          </p>
        )}
      </div>
      {points && points.length > 0 && (
        <p className="mt-3 text-xs text-[var(--sa-text-quaternary)]">
          {t("analytics.hint")} · {points.length} {t("analytics.points")}
        </p>
      )}
    </section>
  );
}

/* Lightweight-charts requires strictly increasing, unique timestamps. When two
   operations share the same second, keep the last value for that second. */
function dedupeByTime<T extends { time: UTCTimestamp; value: number }>(
  data: T[]
): T[] {
  const map = new Map<number, T>();
  for (const d of data) map.set(d.time as number, d);
  return Array.from(map.values()).sort(
    (a, b) => (a.time as number) - (b.time as number)
  );
}
