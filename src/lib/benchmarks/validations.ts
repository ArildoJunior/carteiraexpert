import { z } from "zod";
import { BENCHMARK_TYPES, PERIODS } from "./types";

export const overviewQuerySchema = z.object({
  period: z.enum(PERIODS).default("1M"),
  benchmarks: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean) : []))
    .pipe(z.array(z.enum(BENCHMARK_TYPES)).max(3)),
});

export const evolutionQuerySchema = z.object({
  period: z.enum(PERIODS).default("3M"),
  benchmark: z.enum(BENCHMARK_TYPES).default("IBOV"),
});

export const allocationQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD")
    .optional(),
});

export const moversQuerySchema = z.object({
  period: z.enum(PERIODS).default("1M"),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const heatmapQuerySchema = z.object({
  period: z.enum(PERIODS).default("1M"),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
export type EvolutionQuery = z.infer<typeof evolutionQuerySchema>;
export type AllocationQuery = z.infer<typeof allocationQuerySchema>;
export type MoversQuery = z.infer<typeof moversQuerySchema>;
export type HeatmapQuery = z.infer<typeof heatmapQuerySchema>;
