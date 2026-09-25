"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useT } from "@/lib/i18n";

export type GrmHistoryPoint = { ts: string; L: number; I: number; A: number };

/* GRM I(t) signal chart, built on TradingView Lightweight Charts to match the
   balance-analytics chart (same theme, crosshair, zoom/pan, reset). Renders the
   I(t) series over time. Expects >= 2 points; the parent decides when to show. */
export default function GrmChart({ history }: { history: GrmHistoryPoint[] }) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Create the chart once.
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

  // (Re)build the I(t) line series when the history changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    if (!history || history.length === 0) return;

    const series = chart.addSeries(LineSeries, {
      color: "#cdd6e0",
      lineWidth: 2,
    });
    // Strictly increasing, unique timestamps (seconds); keep last per second.
    const map = new Map<number, number>();
    for (const h of history) {
      const sec = Math.floor(new Date(h.ts).getTime() / 1000);
      if (Number.isFinite(sec) && Number.isFinite(h.I)) map.set(sec, h.I);
    }
    const data = Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as UTCTimestamp, value }));
    series.setData(data);
    seriesRef.current = series;
    chart.timeScale().fitContent();
  }, [history]);

  return (
    <section className="sa-card mt-10 p-6 md:p-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="sa-eyebrow">
          {t("grm.signal")} — {history.length} {t("grm.snapshots")}
        </p>
        <button
          type="button"
          onClick={() => chartRef.current?.timeScale().fitContent()}
          className="sa-btn sa-btn-ghost !rounded-[var(--sa-r-sm)] !px-3 !py-1.5 text-xs"
        >
          {t("analytics.reset")}
        </button>
      </div>
      <div ref={containerRef} className="h-[320px] w-full" />
      <p className="mt-3 text-xs text-[var(--sa-text-quaternary)]">
        {t("analytics.hint")}
      </p>
    </section>
  );
}
