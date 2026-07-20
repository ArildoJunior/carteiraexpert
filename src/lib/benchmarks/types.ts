import { z } from "zod";

export const BENCHMARK_TYPES = ["IBOV", "IFIX", "CDI"] as const;
export type BenchmarkType = (typeof BENCHMARK_TYPES)[number];

export const PERIODS = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "ALL"] as const;
export type Period = (typeof PERIODS)[number];

export interface BenchmarkPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface PortfolioSnapshot {
  date: string;
  totalValue: number;
  totalCost: number;
  twrDaily: number;
  twrCumulative: number;
}

export interface ComparisonPoint {
  date: string;
  portfolio: number; // TWR acumulado base 1.0
  benchmark: number; // índice normalizado base 1.0
}

export const periodSchema = z.enum(PERIODS);
export const benchmarkTypeSchema = z.enum(BENCHMARK_TYPES);
