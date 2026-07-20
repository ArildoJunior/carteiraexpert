import { format, parseISO } from "date-fns";
import type { BenchmarkType } from "./types";

/**
 * Fator de capitalização do CDI a partir da taxa DIÁRIA em decimal.
 * 0.0004583 → 1.0004583
 */
export function getCdiDailyFactor(dailyRate: number | string): number {
  const r = typeof dailyRate === "string" ? Number(dailyRate) : dailyRate;
  if (!Number.isFinite(r) || r < 0) return 1;
  return 1 + r;
}

export function accumulateCdi(dailyRates: Array<number | string>): number {
  let factor = 1;
  for (const r of dailyRates) {
    factor *= getCdiDailyFactor(r);
  }
  return factor;
}

export function cdiLookupKey(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "yyyy-MM-dd");
}

export const CDI_BENCHMARK: BenchmarkType = "CDI";
