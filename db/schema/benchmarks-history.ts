import { sql } from "drizzle-orm";
import { date, index, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

/**
 * benchmarks_history
 *
 * Série histórica de benchmarks usada pelo dashboard analítico (Cap 8).
 * - IBOV / IFIX: `value` = índice de fechamento do dia.
 * - CDI:         `value` = taxa DIÁRIA em decimal (0.0004583 = 0,04583% a.d.).
 *
 * Alimentada pelo job Inngest `sync-benchmarks` (Cap 8C, 22:00 BRT).
 * É dado GLOBAL (não tem user_id).
 */
export const benchmarksHistory = pgTable(
  "benchmarks_history",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    benchmark: text("benchmark").notNull(), // "IBOV" | "IFIX" | "CDI"
    date: date("date").notNull(),
    value: numeric("value", { precision: 20, scale: 8 }).notNull(),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    unqBenchmarkDate: unique("unq_benchmarks_history_benchmark_date").on(
      table.benchmark,
      table.date
    ),
    idxBenchmarkDate: index("idx_benchmarks_history_benchmark_date").on(
      table.benchmark,
      table.date
    ),
  })
);

export type BenchmarkHistory = typeof benchmarksHistory.$inferSelect;
export type NewBenchmarkHistory = typeof benchmarksHistory.$inferInsert;

export const BENCHMARK_TYPES = ["IBOV", "IFIX", "CDI"] as const;
export type BenchmarkType = (typeof BENCHMARK_TYPES)[number];
