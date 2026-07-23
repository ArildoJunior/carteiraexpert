// db/schema/provider-breakdown.ts
// Cap 6 — log de chamadas a provedores externos
// CarteiraExpert

import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const providerBreakdown = pgTable(
  "provider_breakdown",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    provider: text("provider").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
    attempt: integer("attempt").notNull().default(1),
    latencyMs: integer("latency_ms").notNull().default(0),
    errorMessage: text("error_message"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerIdx: index("provider_breakdown_provider_idx").on(
      table.provider,
      table.fetchedAt,
    ),
    categoryIdx: index("provider_breakdown_category_idx").on(
      table.category,
      table.fetchedAt,
    ),
    statusIdx: index("provider_breakdown_status_idx").on(
      table.status,
      table.fetchedAt,
    ),
  }),
);