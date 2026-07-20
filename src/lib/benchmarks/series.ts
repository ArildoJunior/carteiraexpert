import { fromIsoDate, toLocalStartOfDay } from "./period";
import type { BenchmarkPoint, ComparisonPoint, PortfolioSnapshot } from "./types";

/**
 * Alinha série de portfolio (TWR cum.) com série de benchmark
 * (índice normalizado base 1.0), com forward-fill dentro de start..end.
 */
export function alignSeries(
  portfolio: PortfolioSnapshot[],
  benchmark: BenchmarkPoint[],
  start: Date,
  end: Date
): ComparisonPoint[] {
  if (portfolio.length === 0 || benchmark.length === 0) return [];

  const portMap = new Map<string, PortfolioSnapshot>();
  for (const p of portfolio) portMap.set(p.date, p);

  const benchMap = new Map<string, number>();
  for (const b of benchmark) benchMap.set(b.date, Number(b.value));

  const localStart = toLocalStartOfDay(start);
  const localEnd = toLocalStartOfDay(end);

  const sortedBench = [...benchmark]
    .filter((b) => fromIsoDate(b.date) >= localStart && fromIsoDate(b.date) <= localEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sortedBench.length === 0) return [];
  const firstBench = sortedBench[0];
  if (!firstBench) return [];
  const baseBench = Number(firstBench.value);
  if (baseBench === 0) return [];

  const sortedPort = [...portfolio]
    .filter((p) => fromIsoDate(p.date) >= localStart && fromIsoDate(p.date) <= localEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sortedPort.length === 0) return [];
  const firstPort = sortedPort[0];
  if (!firstPort) return [];
  const basePort = Number(firstPort.twrCumulative);

  let lastPortCum = basePort;
  let lastBenchVal = baseBench;
  const allDates = new Set<string>([...portMap.keys(), ...benchMap.keys()]);
  const dates = [...allDates]
    .filter((d) => fromIsoDate(d) >= localStart && fromIsoDate(d) <= localEnd)
    .sort();

  const result: ComparisonPoint[] = [];
  for (const d of dates) {
    const pv = portMap.get(d);
    const bv = benchMap.get(d);
    if (pv) lastPortCum = Number(pv.twrCumulative);
    if (bv !== undefined) lastBenchVal = Number(bv);
    result.push({
      date: d,
      portfolio: lastPortCum,
      benchmark: lastBenchVal / baseBench,
    });
  }
  return result;
}

export function normalizeBenchmarkToOne(points: BenchmarkPoint[]): BenchmarkPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  if (!first) return sorted;
  const base = Number(first.value);
  if (base === 0) return sorted;
  return sorted.map((p) => ({ date: p.date, value: Number(p.value) / base }));
}
